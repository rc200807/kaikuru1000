import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

/** portal に対する権限チェック。OKならownerIdを返す */
function resolveOwner(sessionUser: any, portal: string): string | null {
  if (portal === 'admin' && ADMIN_ROLES.includes(sessionUser.role)) return sessionUser.id
  // 管理ポータルの店舗マスター一覧（顧客一覧の 'admin' とはビューを分離する）
  if (portal === 'admin-stores' && ADMIN_ROLES.includes(sessionUser.role)) return sessionUser.id
  if (portal === 'store' && sessionUser.role === 'store') return sessionUser.id
  return null
}

// 自分の保存ビュー一覧
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const portal = searchParams.get('portal') || ''
  const ownerId = resolveOwner(session.user as any, portal)
  if (!ownerId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const views = await prisma.savedListView.findMany({
    where: { portal, ownerId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  })
  return NextResponse.json({ views })
}

// 保存ビュー作成
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { portal, name, filters, columns } = body as {
    portal: string; name: string; filters: string; columns?: string[]
  }
  const ownerId = resolveOwner(session.user as any, portal)
  if (!ownerId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!name?.trim()) return NextResponse.json({ error: 'ビュー名を入力してください' }, { status: 400 })
  if (typeof filters !== 'string') return NextResponse.json({ error: 'filters が必要です' }, { status: 400 })

  const count = await prisma.savedListView.count({ where: { portal, ownerId } })
  if (count >= 20) return NextResponse.json({ error: '保存できるビューは20件までです' }, { status: 400 })

  const view = await prisma.savedListView.create({
    data: {
      portal,
      ownerId,
      name: name.trim().slice(0, 30),
      filters,
      columns: columns ? JSON.stringify(columns) : null,
      position: count,
    },
  })
  return NextResponse.json(view)
}
