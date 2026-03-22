import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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

  await prisma.announcementRead.upsert({
    where: {
      announcementId_storeId: { announcementId: id, storeId },
    },
    create: { announcementId: id, storeId },
    update: {},
  })

  return NextResponse.json({ ok: true })
}
