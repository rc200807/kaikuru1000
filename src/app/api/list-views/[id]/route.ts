import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 自分の保存ビューだけを操作できるようにownerを検証して取得 */
async function findOwnView(id: string, sessionUser: any) {
  const view = await prisma.savedListView.findUnique({ where: { id } })
  if (!view || view.ownerId !== sessionUser.id) return null
  return view
}

// 保存ビュー更新（名前・フィルタ・列）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const view = await findOwnView(id, session.user as any)
  if (!view) return NextResponse.json({ error: 'ビューが見つかりません' }, { status: 404 })

  const body = await request.json()
  const data: any = {}
  if (typeof body.name === 'string' && body.name.trim()) data.name = body.name.trim().slice(0, 30)
  if (typeof body.filters === 'string') data.filters = body.filters
  if (Array.isArray(body.columns)) data.columns = JSON.stringify(body.columns)

  const updated = await prisma.savedListView.update({ where: { id }, data })
  return NextResponse.json(updated)
}

// 保存ビュー削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const view = await findOwnView(id, session.user as any)
  if (!view) return NextResponse.json({ error: 'ビューが見つかりません' }, { status: 404 })

  await prisma.savedListView.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
