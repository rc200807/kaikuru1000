import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const MIN_PASSWORD_LENGTH = 8

const registerSchema = z.object({
  name:       z.string().min(1, '氏名は必須です').max(100),
  furigana:   z.string().min(1, 'ふりがなは必須です').max(100),
  email:      z.string().email('有効なメールアドレスを入力してください'),
  phone:      z.string().min(1, '電話番号は必須です').max(20),
  address:    z.string().min(1, '住所は必須です').max(200),
  password:   z.string().min(MIN_PASSWORD_LENGTH, `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください`),
  licenseKey: z.string().min(1, 'ライセンスキーは必須です'),
})

// 顧客登録（ライセンスキー必須）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // zodバリデーション
    const parsed = registerSchema.safeParse(body)
    if (!parsed.success) {
      const error = parsed.error.issues[0]?.message ?? 'バリデーションエラー'
      return NextResponse.json({ error }, { status: 400 })
    }

    const { name, furigana, email, phone, address, password, licenseKey } = parsed.data

    // ライセンスキー確認
    const licenseKeyRecord = await prisma.licenseKey.findUnique({
      where: { key: licenseKey },
    })

    if (!licenseKeyRecord) {
      return NextResponse.json({ error: '無効なライセンスキーです' }, { status: 400 })
    }
    if (licenseKeyRecord.isUsed) {
      return NextResponse.json({ error: 'このライセンスキーは既に使用済みです' }, { status: 400 })
    }

    // メールアドレス重複確認
    const existingUser = await prisma.user.findUnique({ where: { email } })
    if (existingUser) {
      return NextResponse.json({ error: 'このメールアドレスは既に登録されています' }, { status: 400 })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    // トランザクションでユーザー作成とキー使用済み更新
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name, furigana, email, phone, address,
          password: hashedPassword,
          licenseKeyId: licenseKeyRecord.id,
        },
      })
      await tx.licenseKey.update({
        where: { id: licenseKeyRecord.id },
        data: { isUsed: true },
      })
      return newUser
    })

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      licenseKey: licenseKey,
    }, { status: 201 })
  } catch (error) {
    console.error('User creation error:', error)
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 })
  }
}
