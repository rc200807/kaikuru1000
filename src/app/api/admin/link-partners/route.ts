import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { generateSecurePassword } from '@/lib/password-utils'
import { sendWelcomeWithPasswordEmail } from '@/lib/mailer'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const createSchema = z.object({
  name: z.string().min(1, '連携パートナー名は必須です').max(120),
  adminName: z.string().min(1, '管理者氏名は必須です').max(100),
  adminEmail: z.string().email('有効なメールアドレスを入力してください'),
  note: z.string().max(2000).optional(),
  formIds: z.array(z.string()).optional(),
  sendEmail: z.boolean().optional(),
})

// 連携パートナー一覧（メンバー数・割当フォーム数付き）
export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const partners = await prisma.linkPartner.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { members: true, forms: true } },
    },
  })
  return NextResponse.json(partners)
}

// 連携パートナー作成（組織 + 初代管理者）。初期パスワードは一度だけ返す（reveal-once）
export async function POST(request: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const { name, adminName, adminEmail, note, formIds, sendEmail } = parsed.data

  // メールのグローバル一意チェック（v1: 1人1組織）
  const dup = await prisma.linkPartnerMember.findUnique({ where: { email: adminEmail } })
  if (dup) {
    return NextResponse.json(
      { error: 'このメールアドレスは既に連携パートナーメンバーとして使用されています' },
      { status: 409 }
    )
  }

  // 割当フォームの存在確認（指定があれば実在するものだけに絞る）
  let validFormIds: string[] = []
  if (formIds && formIds.length > 0) {
    const forms = await prisma.form.findMany({ where: { id: { in: formIds } }, select: { id: true } })
    validFormIds = forms.map((f) => f.id)
  }

  const rawPassword = generateSecurePassword()
  const hashed = await bcrypt.hash(rawPassword, 10)

  const created = await prisma.$transaction(async (tx) => {
    const partner = await tx.linkPartner.create({
      data: {
        name,
        note: note ?? null,
        invitedByAdminId: user.id,
        members: {
          create: {
            name: adminName,
            email: adminEmail,
            password: hashed,
            role: 'partner_admin',
            isActive: true,
            mustChangePassword: true, // 初回ログインでパスワード強制変更
          },
        },
      },
      select: { id: true, name: true, isActive: true, createdAt: true },
    })
    if (validFormIds.length > 0) {
      await tx.linkPartnerForm.createMany({
        data: validFormIds.map((formId) => ({
          linkPartnerId: partner.id,
          formId,
          assignedByAdminId: user.id,
        })),
      })
    }
    return partner
  })

  // 任意でメール送付（EmailConfig 未設定時は false が返る）
  let emailSent = false
  if (sendEmail) {
    const baseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
    const loginUrl = `${baseUrl}/linkpartner/login`
    try {
      emailSent = await sendWelcomeWithPasswordEmail({
        to: adminEmail,
        name: adminName,
        email: adminEmail,
        password: rawPassword,
        loginUrl,
      })
    } catch (e) {
      console.error('Failed to send link partner invitation email:', e)
    }
  }

  // 初期パスワードは一度だけ返す（復元不可）
  return NextResponse.json(
    { ...created, adminEmail, initialPassword: rawPassword, emailSent },
    { status: 201 }
  )
}
