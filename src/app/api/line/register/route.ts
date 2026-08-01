import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { checkInquiryRateLimit, getClientIp } from '@/lib/inquiry-rate-limit'
import { verifyTurnstile } from '@/lib/turnstile'
import { buildUserNameData } from '@/lib/name-utils'
import { buildAuthorizeUrl } from '@/lib/line-login'

// POST /api/line/register — LINE友達登録フォームの送信（公開API）
// 顧客を作成（または既存顧客に突合）して LINE Login のワンタイム state トークンを発行し、
// 認可URLを返す。実際の LINE 紐付けは /api/line/link/callback で行う。
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { storeCode, phone, email, turnstileToken } = body

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

    // --- 既定チャネル（LINE Login 設定済み）を解決 ---
    const channel = await prisma.lineChannel.findFirst({
      where: { isDefault: true, isActive: true },
    })
    if (!channel || !channel.loginChannelId || !channel.loginChannelSecret) {
      return NextResponse.json(
        { error: 'LINE登録は現在ご利用いただけません。お手数ですが店舗までお問い合わせください。' },
        { status: 503 }
      )
    }

    // --- 電話番号正規化（既存フォームと同じ流儀）---
    const normalizedPhone = String(phone).replace(/[-ー\s]/g, '')

    // --- 顧客の突合・作成 ---
    // 1) email があれば email で突合（@unique）
    // 2) email が無ければ電話番号で突合（有効・未マージの顧客のみ）— 再送信時の重複作成防止
    // 3) どちらも無ければ新規作成（address/password は空 — 後から店舗・管理側で補完する運用）
    let userId: string | null = null
    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } })
      if (existing) userId = existing.id
    }
    if (!userId) {
      const byPhone = await prisma.user.findFirst({
        where: { phone: normalizedPhone, isActive: true, mergedIntoUserId: null },
        orderBy: { createdAt: 'asc' },
      })
      if (byPhone) userId = byPhone.id
    }

    if (!userId) {
      try {
        const newUser = await prisma.user.create({
          data: {
            ...nameData,
            phone: normalizedPhone,
            address: '', // フォームでは住所を取らないため空で作成
            email: email || null,
            password: '', // パスワード未設定
            customerType: 'regular',
            customerTypes: JSON.stringify(['regular']),
            storeId: store.id,
            leadSource: 'LINE登録',
          },
        })
        userId = newUser.id
      } catch (e: any) {
        // 同一メールの同時送信（P2002）は既存ユーザーとして扱う
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && email) {
          const concurrent = await prisma.user.findUnique({ where: { email } })
          if (!concurrent) throw e
          userId = concurrent.id
        } else {
          throw e
        }
      }
    } else {
      // 既存顧客の担当店舗が未設定なら、この店舗を割り当てる（既存の割当は上書きしない）
      await prisma.user.updateMany({
        where: { id: userId, storeId: null },
        data: { storeId: store.id },
      })
    }

    // --- ワンタイム state トークン発行（15分有効・1回限り）---
    const token = crypto.randomBytes(32).toString('hex')
    await prisma.lineLinkToken.create({
      data: {
        token,
        userId,
        storeId: store.id,
        lineChannelId: channel.id,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    })

    return NextResponse.json({
      success: true,
      authUrl: buildAuthorizeUrl(channel.loginChannelId, token),
    })
  } catch (error) {
    console.error('[line/register] POST error:', error)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
