import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (!['admin', 'superadmin', 'hr'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await context.params
  const body = await request.json().catch(() => null)
  if (!body || !body.body) {
    return NextResponse.json({ error: 'コメント本文は必須です' }, { status: 400 })
  }

  const report = await prisma.bugReport.findUnique({ where: { id } })
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const urls = Array.isArray(body.imageUrls) ? body.imageUrls.filter((u: any) => typeof u === 'string') : []

  const comment = await prisma.bugReportComment.create({
    data: {
      bugReportId: id,
      authorType: 'admin',
      authorName: body.authorName ? String(body.authorName).slice(0, 100) : (user.name ?? '運営'),
      body: String(body.body),
      imageUrls: JSON.stringify(urls),
    },
  })

  await prisma.bugReport.update({ where: { id }, data: { updatedAt: new Date() } })

  return NextResponse.json(comment)
}
