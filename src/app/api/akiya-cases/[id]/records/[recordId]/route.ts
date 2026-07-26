import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { deleteFile } from '@/lib/storage'
import { resolveAkiyaCaseAccess } from '@/lib/akiya-access'
import { parsePhotoUrls, AKIYA_ITEM_PHOTO_LIMIT } from '@/lib/akiya-items'
import { z } from 'zod'

const RECORD_SELECT = {
  id: true, performedAt: true, gpsLat: true, gpsLng: true, gpsAccuracy: true,
  staffName: true, createdAt: true,
  items: {
    orderBy: { sortOrder: 'asc' as const },
    select: { id: true, itemMasterId: true, itemName: true, sortOrder: true, photoUrls: true, note: true },
  },
} as const

/** 案件配下の記録を解決（アクセス権チェック込み） */
async function resolveRecord(caseId: string, recordId: string, sessionUser: any) {
  const access = await resolveAkiyaCaseAccess(caseId, sessionUser)
  if ('error' in access) return access
  const record = await prisma.akiyaRecord.findFirst({
    where: { id: recordId, akiyaCaseId: caseId },
    select: { id: true, performedAt: true },
  })
  if (!record) return { error: '記録が見つかりません', status: 404 as const }
  return { record }
}

/** 残記録の最新 performedAt で案件の前回訪問日を再計算する */
async function recomputeLastVisitedAt(tx: any, caseId: string) {
  const latest = await tx.akiyaRecord.findFirst({
    where: { akiyaCaseId: caseId },
    orderBy: { performedAt: 'desc' },
    select: { performedAt: true },
  })
  await tx.akiyaCase.update({
    where: { id: caseId },
    data: { lastVisitedAt: latest?.performedAt ?? null },
  })
}

// 記録の個別取得
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; recordId: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, recordId } = await params
  const resolved = await resolveRecord(id, recordId, sessionUser)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const record = await prisma.akiyaRecord.findUnique({ where: { id: recordId }, select: RECORD_SELECT })
  return NextResponse.json(record)
}

const patchSchema = z.object({
  performedAt: z.coerce.date().optional(),
  items: z.array(z.object({
    itemMasterId: z.string().nullable().optional(), // マスタ削除済み項目は null のまま保持
    itemName: z.string().min(1).max(100),
    sortOrder: z.number().int().min(0),
    note: z.string().max(20000).optional(),
    photoUrls: z.array(z.string()).max(AKIYA_ITEM_PHOTO_LIMIT),
  })).max(100).optional(),
})

// 記録の修正（実行日時・項目明細の置換更新）
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; recordId: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, recordId } = await params
  const resolved = await resolveRecord(id, recordId, sessionUser)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const body = await request.json().catch(() => null)
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success || (parsed.data.performedAt === undefined && parsed.data.items === undefined)) {
    return NextResponse.json({ error: '入力内容が正しくありません' }, { status: 400 })
  }
  const data = parsed.data

  const updated = await prisma.$transaction(async (tx) => {
    if (data.items) {
      // 置換更新前に、消える写真URLをベストエフォート削除対象として収集
      const oldItems = await tx.akiyaRecordItem.findMany({
        where: { recordId },
        select: { photoUrls: true },
      })
      const newUrls = new Set(data.items.flatMap(i => i.photoUrls))
      const removedUrls = oldItems
        .flatMap((i: { photoUrls: string }) => parsePhotoUrls(i.photoUrls))
        .filter((u: string) => !newUrls.has(u))

      await tx.akiyaRecordItem.deleteMany({ where: { recordId } })
      await tx.akiyaRecordItem.createMany({
        data: data.items.map(item => ({
          recordId,
          itemMasterId: item.itemMasterId ?? null,
          itemName: item.itemName,
          sortOrder: item.sortOrder,
          photoUrls: JSON.stringify(item.photoUrls),
          note: item.note?.trim() || null,
        })),
      })
      // トランザクション外で消すのが安全だが、失敗しても実害は孤児blobのみ
      setTimeout(() => {
        for (const url of removedUrls) { deleteFile(url).catch(() => { /* ignore */ }) }
      }, 0)
    }

    const record = await tx.akiyaRecord.update({
      where: { id: recordId },
      data: data.performedAt !== undefined ? { performedAt: data.performedAt } : {},
      select: RECORD_SELECT,
    })

    // 実行日時が変わった可能性があるので前回訪問日を再計算
    await recomputeLastVisitedAt(tx, id)
    return record
  })

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, memberId: sessionUser.memberId ?? null, action: '空き家管理記録を修正', req: request })
  return NextResponse.json(updated)
}

// 記録の削除（明細はCascade。写真blobはベストエフォート削除、前回訪問日を再計算）
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; recordId: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, recordId } = await params
  const resolved = await resolveRecord(id, recordId, sessionUser)
  if ('error' in resolved) return NextResponse.json({ error: resolved.error }, { status: resolved.status })

  const items = await prisma.akiyaRecordItem.findMany({ where: { recordId }, select: { photoUrls: true } })
  const urls = items.flatMap(i => parsePhotoUrls(i.photoUrls))

  await prisma.$transaction(async (tx) => {
    await tx.akiyaRecord.delete({ where: { id: recordId } })
    await recomputeLastVisitedAt(tx, id)
  })
  for (const url of urls) { try { await deleteFile(url) } catch { /* ignore */ } }

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, memberId: sessionUser.memberId ?? null, action: '空き家管理記録を削除', req: request })
  return NextResponse.json({ ok: true })
}
