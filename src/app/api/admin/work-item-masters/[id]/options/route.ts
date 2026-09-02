import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

/** 請求項目のチェック項目を追加（管理者） */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const master = await prisma.workItemMaster.findUnique({ where: { id }, select: { id: true, name: true } })
  if (!master) return NextResponse.json({ error: '請求項目が見つかりません' }, { status: 404 })

  const body = await request.json().catch(() => null)
  const label = typeof body?.label === 'string' ? body.label.trim() : ''
  if (!label) return NextResponse.json({ error: '項目名を入力してください' }, { status: 400 })
  if (label.length > 100) return NextResponse.json({ error: '項目名は100文字以内にしてください' }, { status: 400 })

  const dup = await prisma.workItemOption.findFirst({ where: { masterId: id, label } })
  if (dup) return NextResponse.json({ error: '同名のチェック項目が既に存在します' }, { status: 400 })

  const maxSort = await prisma.workItemOption.aggregate({ where: { masterId: id }, _max: { sortOrder: true } })
  const option = await prisma.workItemOption.create({
    data: { masterId: id, label, sortOrder: (maxSort._max.sortOrder ?? -1) + 1 },
  })

  await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name, action: `請求項目「${master.name}」にチェック項目を追加「${label}」`, req: request })
  return NextResponse.json(option, { status: 201 })
}
