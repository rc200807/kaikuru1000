import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

/** 未読リリースノート数（管理者向け） */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ count: 0 })
  }

  const adminId = user.id

  const notes = await prisma.releaseNote.findMany({
    where: { isPublished: true, targetAdmin: true },
    select: { id: true },
  })
  if (notes.length === 0) return NextResponse.json({ count: 0 })

  const readCount = await prisma.releaseNoteRead.count({
    where: { readerType: 'admin', readerId: adminId, releaseNoteId: { in: notes.map(n => n.id) } },
  })

  return NextResponse.json({ count: Math.max(0, notes.length - readCount) })
}
