import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { sendInquiryAutoReply } from '@/lib/mailer'
import { enqueueEmail } from '@/lib/email-queue'
import { checkInquiryRateLimit, getClientIp } from '@/lib/inquiry-rate-limit'
import { verifyTurnstile } from '@/lib/turnstile'
import { buildUserNameData } from '@/lib/name-utils'

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
    const { storeCode, phone, email, postalCode, address, inquiryType, details, items, turnstileToken } = body

    // 氏名: 分割値（新フォーム）・結合値（旧クライアント）の両方を受理し、6フィールドに正規化
    // Inquiry には結合値を保存、User 自動作成時は分割値も保存する
    const nameData = buildUserNameData({
      name: body.name, furigana: body.furigana,
      lastName: body.lastName, firstName: body.firstName,
      lastNameKana: body.lastNameKana, firstNameKana: body.firstNameKana,
    })
    const name = nameData.name
    const furigana = nameData.furigana

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

    // --- CAPTCHA検証（Cloudflare Turnstile）---
    const ip = getClientIp(request.headers)
    const captchaResult = await verifyTurnstile(turnstileToken, ip)
    if (!captchaResult.success) {
      return NextResponse.json(
        { error: '認証に失敗しました。ページを再読み込みしてもう一度お試しください。' },
        { status: 400 }
      )
    }

    // --- レート制限チェック ---
    const rateLimit = await checkInquiryRateLimit({ ip, email })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.reason || '送信回数の上限に達しました。しばらくしてからお試しください。' },
        { status: 429 }
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
          storePhone: store.phone || '0120-22-8196', // 店舗電話番号未設定時は本部代表番号
          storeEmail: store.email ?? null,
          storeAddress: store.address ?? null,
          storePostalCode: store.postalCode ?? null,
          loginUrl: `${baseUrl}/login`,
        }
      } else {
        // 新規ユーザー作成（パスワードなし — 後でセットアップ）
        // ⚠️ 競合状態対策：同じメアドで同時送信された場合、unique制約で失敗するので
        //    P2002エラーをキャッチして既存ユーザーとして扱う
        let newUser
        try {
          newUser = await prisma.user.create({
            data: {
              ...nameData,
              phone: normalizedPhone,
              address,
              email,
              password: '', // パスワード未設定
              customerType: 'regular',
              customerTypes: JSON.stringify(['regular']),
              storeId: store.id,
              leadSource: 'Webフォーム', // お問い合わせフォーム由来は流入経路「Webフォーム」を自動設定
            },
          })
        } catch (e: any) {
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            // 競合により既に作成済み → 既存ユーザーとして再取得
            const concurrent = await prisma.user.findUnique({ where: { email } })
            if (concurrent) {
              userId = concurrent.id
              isExisting = true
              // 既存ユーザー扱いでメールパラメータを組み立てる（後段でセット）
              const baseUrlExisting = getBaseUrl()
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
                storePhone: store.phone || '0120-22-8196',
                storeEmail: store.email ?? null,
                storeAddress: store.address ?? null,
                storePostalCode: store.postalCode ?? null,
                loginUrl: `${baseUrlExisting}/login`,
              }
              // 早期リターン：以降の新規ユーザー処理はスキップ
            } else {
              throw e
            }
          } else {
            throw e
          }
        }

        // 競合で既存扱いになった場合は新規ユーザー処理をスキップ
        if (!newUser) {
          // すでに上の catch で customerEmailParams を設定済み
        } else {
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
          storePhone: store.phone || '0120-22-8196', // 店舗電話番号未設定時は本部代表番号
          storeEmail: store.email ?? null,
          storeAddress: store.address ?? null,
          storePostalCode: store.postalCode ?? null,
          setupUrl: `${baseUrl}/setup-password?token=${token}`,
        }
        } // else block end (newUser exists)
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

    // --- アクセス計測とのCV紐付け（失敗しても問い合わせ本体は成功させる） ---
    if (body.trackingVisitorKey) {
      const { linkConversion } = await import('@/lib/tracking')
      await linkConversion({
        visitorKey: String(body.trackingVisitorKey),
        type: 'inquiry_submit',
        inquiryId: inquiry.id,
        storeId: store.id,
        userId,
      })
    }

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

    // --- 案件（Deal）自動作成 ---
    // レガシー問い合わせフォーム経由のみ案件を作成する。
    // userId が無い（メール未入力で顧客紐付けなし）場合は作成しない。
    // 失敗しても問い合わせ受付・メール・シート連携は止めない（try/catch で握り潰す）。
    if (userId) {
      const itemTitles = Array.isArray(items)
        ? items.filter((i: any) => i?.title && typeof i.title === 'string').map((i: any) => `・${i.title}`)
        : []
      const dealDetail = [
        `申込み内容: ${inquiryType}`,
        details ? `相談内容: ${details}` : null,
        itemTitles.length > 0 ? `買取希望品:\n${itemTitles.join('\n')}` : null,
      ].filter(Boolean).join('\n\n')
      try {
        await prisma.deal.create({
          data: {
            userId,
            storeId: store.id,
            inquiryId: inquiry.id,
            detail: dealDetail,
            status: 'inquiry',
            createdByType: 'customer',
            createdById: userId,
            createdByName: name,
          },
        })
      } catch (e: any) {
        // inquiryId は @unique。再送等での重複（P2002）は無害なので握り潰す
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) {
          console.error('[inquiry] Deal 作成に失敗しました', e)
        }
      }
    }

    // --- メール送信をキューに投入 ---
    // ⚠️ APIリクエスト中にSMTP送信を待たず、cronで2分間隔でバッチ処理する
    // - Vercel関数の同時実行数を圧迫しない
    // - SMTPレート制限・障害時はキューで自動リトライ（最大3回）
    // - 顧客・店舗とも同じタイミングで送信される
    const FALLBACK_NOTIFICATION_EMAIL = 'contact@kaikuru4.com'
    const notifyTo = store.email || FALLBACK_NOTIFICATION_EMAIL
    const isFallback = !store.email
    const inquiryBaseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'

    // 顧客向け自動返信（キュー投入）
    if (customerEmailParams) {
      await enqueueEmail({ type: 'inquiryAutoReply', params: customerEmailParams })
    }

    // 店舗向け通知（キュー投入）
    await enqueueEmail({
      type: 'storeInquiryNotification',
      params: {
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
      },
    })

    console.log(`[inquiry] メールキューに登録完了: customer=${customerEmailParams ? 'yes' : 'skip'} store=${notifyTo}${isFallback ? ' (fallback)' : ''}`)

    // --- Google Sheets へ自動追記（失敗してもお問い合わせ自体は成功させる） ---
    try {
      const { appendInquiryToSheet, appendInquiryToStoreSheet } = await import('@/lib/google-sheets')
      const result = await appendInquiryToSheet(inquiry.id)
      if (!result.success) {
        console.warn(`[inquiry] Sheets append skipped: ${result.message}`)
      }
      // 店舗別シートが発行済みなら、そちらにも追記
      if (store.inquirySpreadsheetId) {
        const storeRes = await appendInquiryToStoreSheet(store.inquirySpreadsheetId, inquiry.id)
        if (!storeRes.success) {
          console.warn(`[inquiry] Store sheet append skipped (${store.code}): ${storeRes.message}`)
        }
      }
    } catch (e) {
      console.error('[inquiry] Sheets append failed', e)
    }

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
