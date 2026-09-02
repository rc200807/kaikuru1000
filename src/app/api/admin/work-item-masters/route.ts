import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

/** 請求項目マスタの追加（管理者） */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: '作業名を入力してください' }, { status: 400 })
  if (name.length > 100) return NextResponse.json({ error: '作業名は100文字以内にしてください' }, { status: 400 })

  const defaultUnitPrice = Math.max(0, Math.trunc(Number(body?.defaultUnitPrice) || 0))
  const notes = typeof body?.notes === 'string' && body.notes.trim() ? body.notes.trim() : null

  const dup = await prisma.workItemMaster.findUnique({ where: { name } })
  if (dup) return NextResponse.json({ error: '同名の請求項目が既に存在します' }, { status: 400 })

  const maxSort = await prisma.workItemMaster.aggregate({ _max: { sortOrder: true } })
  const item = await prisma.workItemMaster.create({
    data: { name, defaultUnitPrice, notes, sortOrder: (maxSort._max.sortOrder ?? -1) + 1 },
  })

  await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name, action: `請求項目マスタを追加「${name}」`, req: request })
  return NextResponse.json(item, { status: 201 })
}
