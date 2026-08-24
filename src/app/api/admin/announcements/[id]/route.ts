import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseAnnouncementTargets, stringifyAnnouncementTargets, countTargetStores } from '@/lib/announcement-target'

/** お知らせ詳細取得 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const announcement = await prisma.announcement.findUnique({
    where: { id },
    include: {
      admin: { select: { name: true } },
      announcementCategory: { select: { id: true, name: true, color: true, icon: true } },
      reads: {
        include: { store: { select: { name: true, code: true } } },
        orderBy: { readAt: 'desc' },
      },
    },
  })

  if (!announcement) {
    return NextResponse.json({ error: 'お知らせが見つかりません' }, { status: 404 })
  }

  const stores = await prisma.store.findMany({ where: { isActive: true }, select: { supportedServices: true } })

  return NextResponse.json({
    ...announcement,
    targetServices: parseAnnouncementTargets(announcement.targetServices),
    totalStores: countTargetStores(announcement.targetServices, stores),
  })
}

/** お知らせ更新 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()

  const existing = await prisma.announcement.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: 'お知らせが見つかりません' }, { status: 404 })
  }

  const updateData: any = {}
  if (body.title !== undefined) updateData.title = body.title.trim()
  if (body.content !== undefined) updateData.content = body.content.trim()
  if (body.categoryId !== undefined) updateData.categoryId = body.categoryId || null
  if (body.priority !== undefined) updateData.priority = body.priority
  if (body.targetServices !== undefined) {
    updateData.targetServices = stringifyAnnouncementTargets(
      Array.isArray(body.targetServices) ? body.targetServices : [],
    )
  }

  if (body.isPublished !== undefined) {
    updateData.isPublished = body.isPublished
    if (body.isPublished && !existing.publishedAt) {
      updateData.publishedAt = new Date()
    }
  }

  const updated = await prisma.announcement.update({
    where: { id },
    data: updateData,
    include: {
      admin: { select: { name: true } },
      announcementCategory: { select: { id: true, name: true, color: true, icon: true } },
    },
  })

  return NextResponse.json({
    ...updated,
    targetServices: parseAnnouncementTargets(updated.targetServices),
  })
}

/** お知らせ削除 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  await prisma.announcement.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
