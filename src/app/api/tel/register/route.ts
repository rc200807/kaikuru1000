import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkInquiryRateLimit, getClientIp } from '@/lib/inquiry-rate-limit'
import { verifyTurnstile } from '@/lib/turnstile'
import { buildUserNameData } from '@/lib/name-utils'
import { resolveOrCreateCustomer } from '@/lib/public-customer'
import { normalizePostalCode } from '@/lib/postal'

/** 店舗に電話番号が未設定の場合の発信先（本部代表番号。問い合わせAPIと同じフォールバック） */
const FALLBACK_TEL = '0120-22-8196'

// POST /api/tel/register — 電話問い合わせフォームの送信（公開API）
// 顧客を作成（または既存顧客に突合）して、発信先の電話番号を返す。
// クライアントはレスポンスの tel を使って発信する（登録と発信を同時に行う）。
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { storeCode, phone, email, postalCode, address, turnstileToken } = body

    // 氏名: 分割値を6フィールドに正規化（結合値 name/furigana が正データ）
    const nameData = buildUserNameData({
      name: body.name, furigana: body.furigana,
      lastName: body.lastName, firstName: body.firstName,
      lastNameKana: body.lastNameKana, firstNameKana: body.firstNameKana,
    })

    // --- バリデーション ---
    const missing: string[] = []
    if (!nameData.name) missing.push('name')
    if (!nameData.furigana) missing.push('furigana')
    if (!phone) missing.push('phone')
    if (!storeCode) missing.push('storeCode')
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `必須項目が不足しています: ${missing.join(', ')}` },
        { status: 400 }
      )
    }
    if (!normalizePostalCode(postalCode)) {
      return NextResponse.json(
        { error: '郵便番号は7桁の数字で入力してください' },
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

    // --- レート制限チェック（DB永続・問い合わせフォームと共通）---
    const rateLimit = await checkInquiryRateLimit({ ip, email })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: rateLimit.reason || '送信回数の上限に達しました。しばらくしてからお試しください。' },
        { status: 429 }
      )
    }

    // --- 店舗検索 ---
    const store = await prisma.store.findUnique({ where: { code: storeCode } })
    if (!store || !store.isActive) {
      return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
    }

    // --- 顧客の突合・作成（住所は郵便番号から自動解決した値を格納）---
    await resolveOrCreateCustomer({
      name: body.name, furigana: body.furigana,
      lastName: body.lastName, firstName: body.firstName,
      lastNameKana: body.lastNameKana, firstNameKana: body.firstNameKana,
      phone,
      email,
      postalCode,
      address,
      storeId: store.id,
      leadSource: '電話問い合わせ',
    })

    return NextResponse.json({
      success: true,
      tel: store.phone || FALLBACK_TEL,
      storeName: store.name,
    })
  } catch (error) {
    console.error('[tel/register] POST error:', error)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
