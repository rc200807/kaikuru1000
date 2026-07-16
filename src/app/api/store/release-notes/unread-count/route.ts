import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 未読リリースノート数（店舗向け） */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ count: 0 })
  }

  const storeId = user.id

  const notes = await prisma.releaseNote.findMany({
    where: { isPublished: true, targetStore: true },
    select: { id: true },
  })
  if (notes.length === 0) return NextResponse.json({ count: 0 })

  const readCount = await prisma.releaseNoteRead.count({
    where: { readerType: 'store', readerId: storeId, releaseNoteId: { in: notes.map(n => n.id) } },
  })

  return NextResponse.json({ count: Math.max(0, notes.length - readCount) })
}
