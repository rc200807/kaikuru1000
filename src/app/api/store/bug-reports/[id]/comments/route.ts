import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await context.params
  const storeId = user.id as string

  const body = await request.json().catch(() => null)
  if (!body || !body.body) {
    return NextResponse.json({ error: 'コメント本文は必須です' }, { status: 400 })
  }

  // 自店舗のレポートか確認
  const report = await prisma.bugReport.findFirst({ where: { id, storeId } })
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const urls = Array.isArray(body.imageUrls) ? body.imageUrls.filter((u: any) => typeof u === 'string') : []

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } })

  const comment = await prisma.bugReportComment.create({
    data: {
      bugReportId: id,
      authorType: 'store',
      authorName: body.authorName ? String(body.authorName).slice(0, 100) : (store?.name ?? null),
      body: String(body.body),
      imageUrls: JSON.stringify(urls),
    },
  })

  // 更新日時を反映
  await prisma.bugReport.update({ where: { id }, data: { updatedAt: new Date() } })

  return NextResponse.json(comment)
}
