import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

/** 公開済みリリースノート一覧（管理者向け・既読フラグ付き） */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminId = user.id

  const notes = await prisma.releaseNote.findMany({
    where: { isPublished: true, targetAdmin: true },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      version: true,
      title: true,
      content: true,
      category: true,
      publishedAt: true,
      reads: {
        where: { readerType: 'admin', readerId: adminId },
        select: { id: true },
      },
    },
  })

  const result = notes.map(n => ({
    id: n.id,
    version: n.version,
    title: n.title,
    content: n.content,
    category: n.category,
    publishedAt: n.publishedAt,
    isRead: n.reads.length > 0,
  }))

  return NextResponse.json(result)
}
