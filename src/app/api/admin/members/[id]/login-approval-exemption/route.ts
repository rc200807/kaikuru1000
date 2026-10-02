import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { canApproveLoginRequests, LOGIN_APPROVAL_EXEMPT_MAX_DAYS } from '@/lib/admin-login-request'

const putSchema = z.object({
  from: z.string().datetime({ offset: true }),
  until: z.string().datetime({ offset: true }),
})

const SELECT = {
  id: true,
  name: true,
  loginApprovalExemptFrom: true,
  loginApprovalExemptUntil: true,
  loginApprovalExemptByName: true,
} as const

/**
 * ID+パスワード方式メンバーの「ログイン承認不要期間」を設定 / 解除する。
 * 設定できるのはログインリクエストを承認できるロール（admin/superadmin）のみ。自分自身には設定できない。
 */
async function authorize(paramsPromise: Promise<{ id: string }>) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!canApproveLoginRequests(user.role)) {
    return { error: NextResponse.json({ error: '承認不要期間を設定する権限がありません' }, { status: 403 }) }
  }
  const { id } = await paramsPromise
  if (id === user.id) {
    return { error: NextResponse.json({ error: '自分自身には設定できません' }, { status: 400 }) }
  }
  const target = await prisma.admin.findUnique({ where: { id }, select: { id: true, role: true, authMethod: true } })
  if (!target || target.role === 'sysadmin') {
    return { error: NextResponse.json({ error: 'メンバーが見つかりません' }, { status: 404 }) }
  }
  if (target.authMethod !== 'idpass') {
    return { error: NextResponse.json({ error: 'ID・パスワード方式のメンバーのみ設定できます' }, { status: 400 }) }
  }
  return { user: user as { id: string; name: string }, id }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(params)
  if ('error' in auth) return auth.error

  const parsed = putSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: '開始日時と終了日時を正しく入力してください' }, { status: 400 })
  }
  const from = new Date(parsed.data.from)
  const until = new Date(parsed.data.until)
  if (until.getTime() <= from.getTime()) {
    return NextResponse.json({ error: '終了日時は開始日時より後にしてください' }, { status: 400 })
  }
  if (until.getTime() <= Date.now()) {
    return NextResponse.json({ error: '終了日時が過去になっています' }, { status: 400 })
  }
  if (until.getTime() - from.getTime() > LOGIN_APPROVAL_EXEMPT_MAX_DAYS * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: `期間は最長${LOGIN_APPROVAL_EXEMPT_MAX_DAYS}日までです` }, { status: 400 })
  }

  const updated = await prisma.admin.update({
    where: { id: auth.id },
    data: {
      loginApprovalExemptFrom: from,
      loginApprovalExemptUntil: until,
      loginApprovalExemptByName: auth.user.name ?? null,
    },
    select: SELECT,
  })
  return NextResponse.json(updated)
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authorize(params)
  if ('error' in auth) return auth.error

  const updated = await prisma.admin.update({
    where: { id: auth.id },
    data: { loginApprovalExemptFrom: null, loginApprovalExemptUntil: null, loginApprovalExemptByName: null },
    select: SELECT,
  })
  return NextResponse.json(updated)
}
