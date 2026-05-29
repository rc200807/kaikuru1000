import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendAssignmentNotification, sendStoreAssignmentNotification } from '@/lib/mailer'
import { z } from 'zod'
import { PASSWORD_REGEX, PASSWORD_ERROR } from '@/lib/passwordValidation'
import { CUSTOMER_TYPES, stringifyCustomerTypes, type CustomerType } from '@/lib/customer-types'
import { recordAccessLog } from '@/lib/access-log'

const registerSchema = z.object({
  name:         z.string().min(1, '氏名は必須です').max(100),
  furigana:     z.string().min(1, 'ふりがなは必須です').max(100),
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

    const { name, furigana, email, phone, password, licenseKey, customerType, customerTypes, leadSource, skipLicenseKey } = parsed.data
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
          name, furigana, email: email || null, phone, address,
          password: hashedPassword,
          customerType: primaryType,
          customerTypes: customerTypesJson,
          leadSource: leadSourceValue,
          ...(autoStoreId ? { storeId: autoStoreId } : {}),
        },
        include: { store: true },
      })

      // 店舗から登録した場合は割り当て通知メールを送信
      // ⚠️ Vercelサーバーレスでは fire-and-forget だとレスポンス返却後に関数が終了して
      // メール送信が中断されるため、必ず await する
      // 顧客タイプが「アキクル」の場合は店舗通知をスキップ
      const isAkikuruUser = user.customerType === 'akikuru'
      if (autoStoreId && user.store?.email && !isAkikuruUser) {
        try {
          await sendAssignmentNotification({
            storeEmail: user.store.email,
            storeName: user.store.name,
            customerName: user.name,
            customerFurigana: user.furigana,
            customerEmail: user.email || '',
            customerPhone: user.phone,
            customerAddress: user.address,
            registeredAt: user.createdAt,
          })
        } catch (err: any) {
          console.error('[Users] 店舗向け割り当て通知メールの送信に失敗しました:', err.message)
        }
      } else if (autoStoreId && isAkikuruUser) {
        console.log(`[Users] アキクル顧客のため店舗通知をスキップ: userId=${user.id}, storeId=${autoStoreId}`)
      }
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

      await recordAccessLog({ userType: sessionUser?.role ?? 'customer', userId: sessionUser?.id ?? user.id, userName: sessionUser?.name ?? user.name, action: `顧客追加「${user.name}」`, req: request })
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
          name, furigana, email, phone, address,
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

    await recordAccessLog({ userType: sessionUser?.role ?? 'customer', userId: sessionUser?.id ?? user.id, userName: sessionUser?.name ?? user.name, action: `顧客追加「${user.name}」`, req: request })
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
