import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enqueueEmail } from '@/lib/email-queue'

// 自店舗の不具合報告一覧
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const storeId = user.id as string
  const reports = await prisma.bugReport.findMany({
    where: { storeId },
    include: {
      comments: { orderBy: { createdAt: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(reports)
}

// 新規不具合報告の作成
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const storeId = user.id as string
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const { title, category, details, imageUrls, reporterName } = body
  if (!title || !category || !details) {
    return NextResponse.json({ error: '件名・種別・詳細は必須です' }, { status: 400 })
  }

  const validCategories = ['system', 'ui', 'operation', 'other']
  if (!validCategories.includes(category)) {
    return NextResponse.json({ error: '不正な種別です' }, { status: 400 })
  }

  const urls = Array.isArray(imageUrls) ? imageUrls.filter((u: any) => typeof u === 'string') : []
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } })

  const report = await prisma.bugReport.create({
    data: {
      storeId,
      title: String(title).slice(0, 200),
      category,
      details: String(details),
      imageUrls: JSON.stringify(urls),
      reporterName: reporterName ? String(reporterName).slice(0, 100) : null,
    },
  })

  // 管理者向け通知メール（キュー投入）
  try {
    const adminTo = process.env.BUG_REPORT_NOTIFICATION_EMAIL || 'contact@kaikuru4.com'
    const baseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
    await enqueueEmail({
      type: 'bugReportNotification',
      params: {
        to: adminTo,
        storeName: store?.name ?? '',
        reporterName: report.reporterName,
        title: report.title,
        category: report.category,
        details: report.details,
        imageCount: urls.length,
        adminUrl: `${baseUrl}/admin/bug-reports`,
        createdAt: report.createdAt,
      },
    })
  } catch (e) {
    console.error('[bug-report] mail queue failed', e)
  }

  return NextResponse.json(report)
}
