import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { encrypt, decrypt } from '@/lib/encrypt'
import { recordAccessLog } from '@/lib/access-log'

export const runtime = 'nodejs'

const createSchema = z.object({
  name: z.string().min(1, '発注先名は必須です').max(120),
  loginId: z.string().min(1, 'メールアドレスまたはIDは必須です').max(200),
  password: z.string().max(200).optional().or(z.literal('')),
  url: z.string().max(1000).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
})

// 一覧（パスワードは復号して返す。システム管理者のみアクセス可）
export async function GET() {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await prisma.supplierAccount.findMany({ orderBy: { createdAt: 'asc' } })
  const accounts = rows.map(r => ({
    id: r.id,
    name: r.name,
    url: r.url,
    loginId: r.loginId,
    password: r.passwordEnc ? safeDecrypt(r.passwordEnc) : '',
    phone: r.phone,
    note: r.note,
  }))
  return NextResponse.json(accounts)
}

export async function POST(req: NextRequest) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const { name, loginId, password, url, phone, note } = parsed.data

  const account = await prisma.supplierAccount.create({
    data: {
      name,
      loginId,
      passwordEnc: password ? encrypt(password) : null,
      url: url?.trim() || null,
      phone: phone?.trim() || null,
      note: note?.trim() || null,
    },
  })
  await recordAccessLog({ userType: 'sysadmin', userId: user.id, userName: user.name, action: `発注先アカウント追加「${name}」`, req })
  return NextResponse.json({ id: account.id }, { status: 201 })
}

function safeDecrypt(v: string): string {
  try { return decrypt(v) } catch { return '' }
}
