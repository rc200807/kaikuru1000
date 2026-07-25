import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 公開済みリリースノート単体（店舗向け・既読フラグ付き） */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await ctx.params
  const storeId = user.id

  const n = await prisma.releaseNote.findFirst({
    where: { id, isPublished: true, targetStore: true },
    select: {
      id: true,
      version: true,
      title: true,
      content: true,
      category: true,
      publishedAt: true,
      reads: { where: { readerType: 'store', readerId: storeId }, select: { id: true } },
    },
  })
  if (!n) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({
    id: n.id,
    version: n.version,
    title: n.title,
    content: n.content,
    category: n.category,
    publishedAt: n.publishedAt,
    isRead: n.reads.length > 0,
  })
}
