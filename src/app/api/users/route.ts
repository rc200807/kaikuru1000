import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendStoreAssignmentNotification } from '@/lib/mailer'
import { z } from 'zod'
import { PASSWORD_REGEX, PASSWORD_ERROR } from '@/lib/passwordValidation'
import { CUSTOMER_TYPES, stringifyCustomerTypes, type CustomerType } from '@/lib/customer-types'
import { recordAccessLog } from '@/lib/access-log'
import { buildUserNameData } from '@/lib/name-utils'

const registerSchema = z.object({
  // 新形式（姓・名分割）と旧形式（結合 name/furigana）の両方を受理
  name:          z.string().max(100).optional().or(z.literal('')),
  furigana:      z.string().max(100).optional().or(z.literal('')),
  lastName:      z.string().max(50).optional().or(z.literal('')),
  firstName:     z.string().max(50).optional().or(z.literal('')),
  lastNameKana:  z.string().max(50).optional().or(z.literal('')),
  firstNameKana: z.string().max(50).optional().or(z.literal('')),
  email:        z.string().email('有効なメールアドレスを入力してください').optional().or(z.literal('')),
  phone:        z.string().max(20).optional().or(z.literal('')).transform(v => (v ?? '').replace(/[-ー\s]/g, '')),
  address:      z.string().max(200).optional().or(z.literal('')),
  password:     z.string().regex(PASSWORD_REGEX, PASSWORD_ERROR).optional().or(z.literal('')),
  licenseKey:   z.string().optional(),
  customerType: z.enum(CUSTOMER_TYPES).optional(),
  customerTypes: z.array(z.enum(CUSTOMER_TYPES)).optional(),
  leadSource:   z.string().max(100).optional(), // 流入経路
  skipLicenseKey: z.boolean().optional(), // 管理者/店舗からの追加時にライセンスキーをスキップ
})
  .refine(d => (d.lastName?.trim() && d.firstName?.trim()) || d.name?.trim(), { message: '氏名は必須です' })
  .refine(d => (d.lastNameKana?.trim() && d.firstNameKana?.trim()) || d.furigana?.trim(), { message: 'ふりがなは必須です' })

// 顧客登録（ライセンスキー必須 or 通常買取はキー不要）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // zodバリデーション
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      const error = parsed.error.issues[0]?.message ?? 'バリデーションエラー'
      return NextResponse.json({ error }, { status: 400 })
    }

    const { email, phone, password, licenseKey, customerType, customerTypes, leadSource, skipLicenseKey } = parsed.data
    const nameData = buildUserNameData(parsed.data)
    const address = parsed.data.address ?? ''
    const leadSourceValue = leadSource && leadSource.trim() ? leadSource.trim() : null

    // 店舗ユーザーが登録した場合は、その店舗に自動割り当てする
    const session = await getServerSession(authOptions)
    const sessionUser = session?.user as any
    const autoStoreId: string | null = sessionUser?.role === 'store' && sessionUser?.id ? sessionUser.id : null

    // 主タイプ決定（customerType → customerTypes[0] → 'visit'）
    const primaryType: CustomerType = (customerType ?? customerTypes?.[0] ?? 'visit') as CustomerType
    const typesArray = (customerTypes && customerTypes.length > 0 ? customerTypes : [primaryType]) as CustomerType[]
    const customerTypesJson = stringifyCustomerTypes(typesArray, primaryType)

    // 通常買取 or アキクル or skipLicenseKey（管理者/店舗からの追加）はライセンスキー不要
    const isLicenseFree = primaryType === 'regular' || primaryType === 'akikuru'
    const needsLicenseKey = !isLicenseFree && !skipLicenseKey && !licenseKey

    if (needsLicenseKey) {
      return NextResponse.json({ error: 'ライセンスキーは必須です' }, { status: 400 })
    }

    // メールアドレス重複確認（メールがある場合のみ）
    if (email) {
      const existingUser = await prisma.user.findUnique({ where: { email } })
      if (existingUser) {
        return NextResponse.json({ error: 'このメールアドレスは既に登録されています' }, { status: 400 })
      }
    }

    // パスワードがない場合はランダム生成（管理者/店舗からの追加時）
    const actualPassword = password || Math.random().toString(36).slice(-12) + 'A1!'
    const hashedPassword = await bcrypt.hash(actualPassword, 10)

    // ライセンスキーなしで作成（通常買取 / アキクル / 管理者・店舗からの追加）
    if (isLicenseFree || skipLicenseKey || !licenseKey) {
      const user = await prisma.user.create({
        data: {
          ...nameData, email: email || null, phone, address,
          password: hashedPassword,
          customerType: primaryType,
          customerTypes: customerTypesJson,
          leadSource: leadSourceValue,
          ...(autoStoreId ? { storeId: autoStoreId } : {}),
        },
        include: { store: true },
      })

      // 店舗が自分で登録した顧客には「担当顧客のご案内」（店舗向け割り当て通知）は送らない。
      // この通知は本部から割り当てた場合のみ /api/assignments で送信する。
      // ⚠️ Vercelサーバーレスでは fire-and-forget だとレスポンス返却後に関数が終了して
      // メール送信が中断されるため、以下の顧客本人向けメールは必ず await する
      if (autoStoreId && user.email && user.store) {
        const baseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
        try {
          await sendStoreAssignmentNotification({
            to: user.email,
            name: user.name,
            storeName: user.store.name,
            customerType: user.customerType,
            loginUrl: `${baseUrl}/login`,
          })
        } catch (err: any) {
          console.error('[Users] 顧客向け割り当て通知メールの送信に失敗しました:', err.message)
        }
      }

      await recordAccessLog({ userType: sessionUser?.role ?? 'customer', userId: sessionUser?.id ?? user.id, userName: sessionUser?.name ?? user.name, memberId: sessionUser?.memberId ?? null, action: `顧客追加「${user.name}」`, req: request })
      return NextResponse.json({
        id: user.id,
        name: user.name,
        email: user.email,
      }, { status: 201 })
    }

    // ライセンスキーありの場合
    const licenseKeyRecord = await prisma.licenseKey.findUnique({
      where: { key: licenseKey! },
    })

    if (!licenseKeyRecord) {
      return NextResponse.json({ error: '無効なライセンスキーです' }, { status: 400 })
    }
    if (licenseKeyRecord.isUsed) {
      return NextResponse.json({ error: 'このライセンスキーは既に使用済みです' }, { status: 400 })
    }

    // トランザクションでユーザー作成とキー使用済み更新
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          ...nameData, email, phone, address,
          password: hashedPassword,
          customerType: primaryType,
          customerTypes: customerTypesJson,
          leadSource: leadSourceValue,
          licenseKeyId: licenseKeyRecord.id,
          ...(autoStoreId ? { storeId: autoStoreId } : {}),
        },
      })
      await tx.licenseKey.update({
        where: { id: licenseKeyRecord.id },
        data: { isUsed: true },
      })
      return newUser
    })

    await recordAccessLog({ userType: sessionUser?.role ?? 'customer', userId: sessionUser?.id ?? user.id, userName: sessionUser?.name ?? user.name, memberId: sessionUser?.memberId ?? null, action: `顧客追加「${user.name}」`, req: request })
    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      licenseKey: licenseKey,
    }, { status: 201 })
  } catch (error: any) {
    console.error('User creation error:', error)
    const detail = error?.message || String(error)
    return NextResponse.json({ error: 'サーバーエラーが発生しました', detail }, { status: 500 })
  }
}
