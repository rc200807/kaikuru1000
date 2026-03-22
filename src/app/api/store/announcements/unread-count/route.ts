import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 未読お知らせ数 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ count: 0 })
  }

  const storeId = user.id

  const [totalPublished, readCount] = await Promise.all([
    prisma.announcement.count({ where: { isPublished: true } }),
    prisma.announcementRead.count({ where: { storeId } }),
  ])

  return NextResponse.json({ count: Math.max(0, totalPublished - readCount) })
}
