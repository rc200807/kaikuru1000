import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendInquiryAutoReply, sendStoreInquiryNotification } from '@/lib/mailer'

// SMTP送信を await するため、関数の最大実行時間を延ばす（Pro/Enterprise必須）
export const maxDuration = 60

function getBaseUrl() {
  if (process.env.NEXTAUTH_URL) return process.env.NEXTAUTH_URL
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { storeCode, name, furigana, phone, email, postalCode, address, inquiryType, details, items } = body

    // --- バリデーション ---
    const missing: string[] = []
    if (!name) missing.push('name')
    if (!furigana) missing.push('furigana')
    if (!phone) missing.push('phone')
    if (!address) missing.push('address')
    if (!inquiryType) missing.push('inquiryType')
    if (!storeCode) missing.push('storeCode')
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `必須項目が不足しています: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    // --- 店舗検索 ---
    const store = await prisma.store.findUnique({ where: { code: storeCode } })
    if (!store) {
      return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
    }

    // --- 電話番号正規化 ---
    const normalizedPhone = phone.replace(/[-ー\s]/g, '')

    // --- ユーザー紐付けロジック ---
    // メール送信は後段でまとめて並列実行するため、ここではメール送信パラメータの組み立てのみ行う
    let userId: string | null = null
    let isExisting: boolean | null = null
    let customerEmailParams: Parameters<typeof sendInquiryAutoReply>[0] | null = null

    if (email) {
      const existingUser = await prisma.user.findUnique({ where: { email } })
      const baseUrl = getBaseUrl()

      if (existingUser) {
        // 既存ユーザー
        userId = existingUser.id
        isExisting = true

        customerEmailParams = {
          to: email,
          name,
          storeName: store.name,
          inquiryType,
          isExisting: true,
          customerFurigana: furigana,
          customerPhone: normalizedPhone,
          customerEmail: email,
          customerPostalCode: postalCode || null,
          customerAddress: address,
          customerDetails: details || null,
          storePhone: store.phone ?? null,
          storeEmail: store.email ?? null,
          storeAddress: store.address ?? null,
          storePostalCode: store.postalCode ?? null,
          loginUrl: `${baseUrl}/login`,
        }
      } else {
        // 新規ユーザー作成（パスワードなし — 後でセットアップ）
        const newUser = await prisma.user.create({
          data: {
            name,
            furigana,
            phone: normalizedPhone,
            address,
            email,
            password: '', // パスワード未設定
            customerType: 'regular',
            customerTypes: JSON.stringify(['regular']),
            storeId: store.id,
          },
        })
        userId = newUser.id
        isExisting = false

        // セットアップトークン生成
        const token = crypto.randomBytes(32).toString('hex')
        await prisma.passwordResetToken.create({
          data: {
            token,
            email,
            userType: 'customer',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7日間
          },
        })

        customerEmailParams = {
          to: email,
          name,
          storeName: store.name,
          inquiryType,
          isExisting: false,
          customerFurigana: furigana,
          customerPhone: normalizedPhone,
          customerEmail: email,
          customerPostalCode: postalCode || null,
          customerAddress: address,
          customerDetails: details || null,
          storePhone: store.phone ?? null,
          storeEmail: store.email ?? null,
          storeAddress: store.address ?? null,
          storePostalCode: store.postalCode ?? null,
          setupUrl: `${baseUrl}/setup-password?token=${token}`,
        }
      }
    }

    // --- お問い合わせ作成 ---
    const inquiry = await prisma.inquiry.create({
      data: {
        storeId: store.id,
        name,
        furigana,
        phone: normalizedPhone,
        email: email || null,
        postalCode: postalCode || null,
        address,
        inquiryType,
        details: details || null,
        userId,
      },
    })

    // --- 買取トライ（PurchaseMemo）作成 ---
    let itemCount = 0
    if (userId && Array.isArray(items) && items.length > 0) {
      for (const item of items) {
        if (!item.title || typeof item.title !== 'string') continue
        await prisma.purchaseMemo.create({
          data: {
            userId,
            inquiryId: inquiry.id,
            title: item.title,
            imageUrls: JSON.stringify(item.imageUrl ? [item.imageUrl] : []),
            status: 'pending',
          },
        })
        itemCount++
      }
    }

    // --- メール送信（顧客自動返信＋店舗通知を並列実行） ---
    // 店舗メール未登録時は本部のフォールバック宛先に送信
    // ⚠️ Vercelサーバーレスでは fire-and-forget だと関数終了で送信中断するため必ず await する
    // ⚠️ 顧客と店舗を直列で送ると店舗メールが2〜5秒遅延するため Promise.allSettled で並列化
    const FALLBACK_NOTIFICATION_EMAIL = 'contact@kaikuru4.com'
    const notifyTo = store.email || FALLBACK_NOTIFICATION_EMAIL
    const isFallback = !store.email
    const inquiryBaseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
    console.log(`[inquiry] メール送信開始: customer=${customerEmailParams ? 'yes' : 'skip'} store=${notifyTo}${isFallback ? ' (fallback)' : ''}`)

    const mailTasks: Promise<unknown>[] = []

    // 顧客向け自動返信
    if (customerEmailParams) {
      mailTasks.push(
        sendInquiryAutoReply(customerEmailParams)
          .then(() => console.log(`[inquiry] 顧客向け自動返信メール送信成功: ${customerEmailParams!.to}`))
          .catch((err: any) => console.error('[inquiry] 顧客向け自動返信メール送信失敗:', err?.message ?? err))
      )
    }

    // 店舗向け通知
    mailTasks.push(
      sendStoreInquiryNotification({
        storeEmail: notifyTo,
        storeName: store.name,
        isFallbackRecipient: isFallback,
        customerName: name,
        customerFurigana: furigana,
        customerPhone: normalizedPhone,
        customerEmail: email || null,
        customerPostalCode: postalCode || null,
        customerAddress: address,
        inquiryType,
        details: details || null,
        itemCount,
        inquiryAdminUrl: `${inquiryBaseUrl}/store/inquiries`,
        receivedAt: inquiry.createdAt,
      })
        .then(sent => {
          if (sent) console.log(`[inquiry] 店舗通知メール送信成功: ${notifyTo}${isFallback ? ' (fallback)' : ''}`)
          else console.warn(`[inquiry] 店舗通知メール送信スキップ: SMTP設定が無効または未構成です`)
        })
        .catch((err: any) => console.error('[inquiry] 店舗通知メール送信失敗:', err?.message ?? err))
    )

    // 並列実行を待機（個別の失敗はcatch済みなのでallSettledで全完了を待つ）
    await Promise.allSettled(mailTasks)

    return NextResponse.json({
      success: true,
      inquiryId: inquiry.id,
      isExisting,
      itemCount,
    })
  } catch (error) {
    console.error('Inquiry POST error:', error)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
