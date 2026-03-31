import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { sendInquiryAutoReply } from '@/lib/mailer'

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
    let userId: string | null = null
    let isExisting: boolean | null = null

    if (email) {
      const existingUser = await prisma.user.findUnique({ where: { email } })

      if (existingUser) {
        // 既存ユーザー
        userId = existingUser.id
        isExisting = true
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
            customerType: 'visit',
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

        // セットアップURL付きの自動返信メール
        const baseUrl = getBaseUrl()
        const setupUrl = `${baseUrl}/setup-password?token=${token}`

        await sendInquiryAutoReply({
          to: email,
          name,
          storeName: store.name,
          inquiryType,
          isExisting: false,
          setupUrl,
          itemCount: Array.isArray(items) ? items.filter((i: any) => i.title).length : 0,
        }).catch(() => {}) // メール送信失敗は握りつぶす
      }

      // 既存ユーザーにはログイン案内メール
      if (isExisting) {
        const baseUrl = getBaseUrl()
        const loginUrl = `${baseUrl}/login`

        await sendInquiryAutoReply({
          to: email,
          name,
          storeName: store.name,
          inquiryType,
          isExisting: true,
          loginUrl,
          itemCount: Array.isArray(items) ? items.filter((i: any) => i.title).length : 0,
        }).catch(() => {})
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
            title: item.title,
            imageUrls: JSON.stringify(item.imageUrl ? [item.imageUrl] : []),
            status: 'pending',
          },
        })
        itemCount++
      }
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
