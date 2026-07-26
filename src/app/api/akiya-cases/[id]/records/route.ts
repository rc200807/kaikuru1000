import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { resolveAkiyaCaseAccess } from '@/lib/akiya-access'
import { AKIYA_ITEM_PHOTO_LIMIT } from '@/lib/akiya-items'
import { z } from 'zod'

const RECORD_SELECT = {
  id: true, performedAt: true, gpsLat: true, gpsLng: true, gpsAccuracy: true,
  staffName: true, createdAt: true,
  items: {
    orderBy: { sortOrder: 'asc' as const },
    select: { id: true, itemMasterId: true, itemName: true, sortOrder: true, photoUrls: true, note: true },
  },
} as const

// 管理記録一覧
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveAkiyaCaseAccess(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const records = await prisma.akiyaRecord.findMany({
    where: { akiyaCaseId: id },
    orderBy: { performedAt: 'desc' },
    select: RECORD_SELECT,
  })
  return NextResponse.json(records)
}

const createSchema = z.object({
  performedAt: z.coerce.date(),
  gpsLat: z.number().nullable().optional(),
  gpsLng: z.number().nullable().optional(),
  gpsAccuracy: z.number().nullable().optional(),
  items: z.array(z.object({
    itemMasterId: z.string().min(1),
    note: z.string().max(20000).optional(),
    photoUrls: z.array(z.string()).max(AKIYA_ITEM_PHOTO_LIMIT),
  })).max(100),
})

// 管理記録の作成。項目名・順序はマスタからスナップショットし、案件の前回訪問日を自動更新
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveAkiyaCaseAccess(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: '入力内容が正しくありません' }, { status: 400 })
  const data = parsed.data

  // 項目マスタのスナップショット（name / sortOrder）
  const masterIds = data.items.map(i => i.itemMasterId)
  const masters = await prisma.akiyaManagementItem.findMany({
    where: { id: { in: masterIds } },
    select: { id: true, name: true, sortOrder: true },
  })
  const masterById = new Map(masters.map(m => [m.id, m]))
  for (const item of data.items) {
    if (!masterById.has(item.itemMasterId)) {
      return NextResponse.json({ error: '管理項目が見つかりません' }, { status: 400 })
    }
  }

  // 担当スタッフ: メンバーログインならメンバー名、店舗直ログインなら店舗名
  const staffName: string | null = sessionUser.memberName ?? sessionUser.name ?? null

  const created = await prisma.$transaction(async (tx) => {
    const record = await tx.akiyaRecord.create({
      data: {
        akiyaCaseId: id,
        performedAt: data.performedAt,
        gpsLat: data.gpsLat ?? null,
        gpsLng: data.gpsLng ?? null,
        gpsAccuracy: data.gpsAccuracy ?? null,
        staffName,
        memberId: sessionUser.memberId ?? null,
        items: {
          create: data.items.map(item => {
            const master = masterById.get(item.itemMasterId)!
            return {
              itemMasterId: item.itemMasterId,
              itemName: master.name,
              sortOrder: master.sortOrder,
              photoUrls: JSON.stringify(item.photoUrls),
              note: item.note?.trim() || null,
            }
          }),
        },
      },
      select: RECORD_SELECT,
    })

    // 前回訪問日: 既存値より新しい場合のみ更新（過去日付の遡及記録で巻き戻さない）
    const last = access.akiyaCase.lastVisitedAt
    if (!last || data.performedAt > last) {
      await tx.akiyaCase.update({ where: { id }, data: { lastVisitedAt: data.performedAt } })
    }

    return record
  })

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, memberId: sessionUser.memberId ?? null, action: '空き家管理記録を追加', req: request })
  return NextResponse.json(created, { status: 201 })
}
