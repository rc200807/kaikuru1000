import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { announcementVisibilityWhere } from '@/lib/announcement-target'

/** お知らせ既読マーク */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const storeId = user.id

  // 配信対象外のお知らせは既読にしない（管理側の既読数を汚さないため）
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { supportedServices: true },
  })
  const visible = await prisma.announcement.findFirst({
    where: { id, isPublished: true, ...announcementVisibilityWhere(store?.supportedServices) },
    select: { id: true },
  })
  if (!visible) {
    return NextResponse.json({ error: 'お知らせが見つかりません' }, { status: 404 })
  }

  await prisma.announcementRead.upsert({
    where: {
      announcementId_storeId: { announcementId: id, storeId },
    },
    create: { announcementId: id, storeId },
    update: {},
  })

  return NextResponse.json({ ok: true })
}
