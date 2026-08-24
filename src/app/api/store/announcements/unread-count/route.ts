import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { announcementVisibilityWhere } from '@/lib/announcement-target'

/** 未読お知らせ数 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ count: 0 })
  }

  const storeId = user.id

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { supportedServices: true },
  })
  // 配信対象かつ公開中のお知らせだけを母数にする（既読は同じ母集団の中で数える）
  const where = { isPublished: true, ...announcementVisibilityWhere(store?.supportedServices) }

  const [total, readCount] = await Promise.all([
    prisma.announcement.count({ where }),
    prisma.announcement.count({ where: { ...where, reads: { some: { storeId } } } }),
  ])

  return NextResponse.json({ count: Math.max(0, total - readCount) })
}
