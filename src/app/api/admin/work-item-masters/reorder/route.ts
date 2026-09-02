import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

/** 請求項目マスタの並び替え。{ ids: string[] } を受け取り、配列順に sortOrder を振り直す */
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const ids: unknown = body?.ids
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every(id => typeof id === 'string')) {
    return NextResponse.json({ error: 'ids が不正です' }, { status: 400 })
  }

  await prisma.$transaction(
    (ids as string[]).map((id, i) =>
      prisma.workItemMaster.update({ where: { id }, data: { sortOrder: i } }),
    ),
  )

  await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name, action: '請求項目マスタを並び替え', req: request })
  return NextResponse.json({ ok: true })
}
