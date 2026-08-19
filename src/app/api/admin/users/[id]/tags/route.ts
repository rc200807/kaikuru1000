import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizeTagLabel } from '@/lib/customer-tags'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin', 'superadmin', 'hr'].includes(user?.role)) return null
  return user as { id: string; role: string }
}

const tagSelect = { id: true, label: true, source: true, formId: true } as const

/** 顧客のタグ一覧 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const tags = await prisma.customerTag.findMany({
    where: { userId: id },
    select: tagSelect,
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json({ tags })
}

/** 顧客にタグを手動で付ける（同名タグが既にあれば何も変えずにそのまま返す） */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const body = await req.json().catch(() => ({}))
  const label = normalizeTagLabel(body?.label)
  if (!label) return NextResponse.json({ error: 'タグ名を入力してください' }, { status: 400 })

  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } })
  if (!user) return NextResponse.json({ error: '顧客が見つかりません' }, { status: 404 })

  const existing = await prisma.customerTag.findUnique({
    where: { userId_label: { userId: id, label } },
    select: tagSelect,
  })
  if (existing) return NextResponse.json({ tag: existing })

  const tag = await prisma.customerTag.create({
    data: { userId: id, label, source: 'manual' },
    select: tagSelect,
  })
  return NextResponse.json({ tag }, { status: 201 })
}

/** 顧客からタグを外す（?tagId= または ?label= で指定。フォーム由来のタグも外せる） */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const { searchParams } = new URL(req.url)
  const tagId = searchParams.get('tagId') || ''
  const label = normalizeTagLabel(searchParams.get('label'))
  if (!tagId && !label) return NextResponse.json({ error: 'tagId または label が必要です' }, { status: 400 })

  // userId を条件に含めて、他の顧客のタグを消せないようにする
  const result = await prisma.customerTag.deleteMany({
    where: { userId: id, ...(tagId ? { id: tagId } : { label: label! }) },
  })
  if (result.count === 0) return NextResponse.json({ error: 'タグが見つかりません' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
