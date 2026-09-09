import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

/** 訪問目的マスタの一覧（無効なものも含む・管理者） */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const purposes = await prisma.visitPurpose.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true, name: true, sortOrder: true, isActive: true, createdAt: true,
      _count: { select: { visits: true } },
    },
  })
  return NextResponse.json(purposes.map(p => ({ ...p, visitCount: p._count.visits })))
}

/** 訪問目的マスタの追加（管理者） */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: '訪問目的を入力してください' }, { status: 400 })
  if (name.length > 50) return NextResponse.json({ error: '訪問目的は50文字以内にしてください' }, { status: 400 })

  const dup = await prisma.visitPurpose.findUnique({ where: { name } })
  if (dup) return NextResponse.json({ error: '同名の訪問目的が既に存在します' }, { status: 400 })

  const maxSort = await prisma.visitPurpose.aggregate({ _max: { sortOrder: true } })
  const purpose = await prisma.visitPurpose.create({
    data: { name, sortOrder: (maxSort._max.sortOrder ?? -1) + 10 },
  })

  await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name, action: `訪問目的を追加「${name}」`, req: request })
  return NextResponse.json(purpose, { status: 201 })
}
