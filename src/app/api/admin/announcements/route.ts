import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseAnnouncementTargets, stringifyAnnouncementTargets, countTargetStores } from '@/lib/announcement-target'

/** お知らせ一覧（管理者用 - 下書き含む全件 + 既読状況） */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [announcements, stores] = await Promise.all([
    prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        admin: { select: { name: true } },
        announcementCategory: { select: { id: true, name: true, color: true, icon: true } },
        _count: { select: { reads: true } },
      },
    }),
    // 配信対象の店舗数を数えるため対応サービスだけ取得（有効店舗のみ・件数が小さいのでJS側で突合）
    prisma.store.findMany({ where: { isActive: true }, select: { supportedServices: true } }),
  ])

  const result = announcements.map(a => ({
    ...a,
    readCount: a._count.reads,
    // 母数は「配信対象の店舗数」。全店舗向けなら有効店舗数と同じ
    totalStores: countTargetStores(a.targetServices, stores),
    targetServices: parseAnnouncementTargets(a.targetServices),
    _count: undefined,
  }))

  return NextResponse.json(result)
}

/** お知らせ作成 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { title, content, categoryId, priority, isPublished, targetServices } = body

  if (!title?.trim() || !content?.trim()) {
    return NextResponse.json({ error: 'タイトルと本文は必須です' }, { status: 400 })
  }

  const announcement = await prisma.announcement.create({
    data: {
      title: title.trim(),
      content: content.trim(),
      category: 'general', // レガシー互換
      categoryId: categoryId || null,
      priority: priority || 'normal',
      // 配信対象（対応サービス）。未指定・空配列は全店舗向け
      targetServices: stringifyAnnouncementTargets(Array.isArray(targetServices) ? targetServices : []),
      isPublished: !!isPublished,
      publishedAt: isPublished ? new Date() : null,
      adminId: user.id,
    },
    include: {
      admin: { select: { name: true } },
      announcementCategory: { select: { id: true, name: true, color: true, icon: true } },
    },
  })

  return NextResponse.json(announcement, { status: 201 })
}
