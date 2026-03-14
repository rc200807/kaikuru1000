import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const VALID_STATUSES = ['pending', 'reviewed', 'completed']

/** 買取相談メモ更新 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await request.json()

  const memo = await prisma.purchaseMemo.findUnique({ where: { id } })
  if (!memo) return NextResponse.json({ error: 'メモが見つかりません' }, { status: 404 })

  const updateData: any = {}

  if (sessionUser.role === 'customer') {
    // 顧客は自分のpendingメモの内容のみ編集可
    if (memo.userId !== sessionUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (memo.status !== 'pending') {
      return NextResponse.json({ error: 'この状態では編集できません' }, { status: 400 })
    }
    if (body.title !== undefined) updateData.title = body.title.trim()
    if (body.description !== undefined) updateData.description = body.description?.trim() || null
    if (body.imageUrls !== undefined) {
      updateData.imageUrls = JSON.stringify(Array.isArray(body.imageUrls) ? body.imageUrls : [])
    }
  } else if (sessionUser.role === 'store' || sessionUser.role === 'admin') {
    // 店舗・管理者はステータスとstoreNoteを更新可
    if (sessionUser.role === 'store') {
      // 自店舗の顧客のメモのみ
      const user = await prisma.user.findUnique({ where: { id: memo.userId }, select: { storeId: true } })
      if (user?.storeId !== sessionUser.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json({ error: '無効なステータスです' }, { status: 400 })
      }
      updateData.status = body.status
    }
    if (body.storeNote !== undefined) updateData.storeNote = body.storeNote?.trim() || null
  } else {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const updated = await prisma.purchaseMemo.update({ where: { id }, data: updateData })
  return NextResponse.json(updated)
}

/** 買取相談メモ削除 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const memo = await prisma.purchaseMemo.findUnique({ where: { id } })
  if (!memo) return NextResponse.json({ error: 'メモが見つかりません' }, { status: 404 })

  if (sessionUser.role === 'customer') {
    if (memo.userId !== sessionUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  } else if (sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.purchaseMemo.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
