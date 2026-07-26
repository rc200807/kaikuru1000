import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { deleteFile } from '@/lib/storage'
import { isAkiyaPlan } from '@/lib/akiya-plans'
import { isAkiyaStatus } from '@/lib/akiya-status'
import { parsePhotoUrls } from '@/lib/akiya-items'
import { resolveAkiyaCaseAccess } from '@/lib/akiya-access'

// 案件詳細（記録タイムライン含む）
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveAkiyaCaseAccess(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const detail = await prisma.akiyaCase.findUnique({
    where: { id },
    select: {
      id: true, propertyAddress: true, startDate: true, endDate: true,
      plan: true, status: true, photoUrls: true, note: true,
      lastVisitedAt: true, nextVisitAt: true,
      createdByName: true, createdAt: true, updatedAt: true,
      user: { select: { id: true, name: true, furigana: true, phone: true, email: true, address: true } },
      store: { select: { id: true, name: true, code: true } },
      records: {
        orderBy: { performedAt: 'desc' },
        select: {
          id: true, performedAt: true, gpsLat: true, gpsLng: true, gpsAccuracy: true,
          staffName: true, createdAt: true,
          items: {
            orderBy: { sortOrder: 'asc' },
            select: { id: true, itemMasterId: true, itemName: true, sortOrder: true, photoUrls: true, note: true },
          },
        },
      },
    },
  })
  return NextResponse.json(detail)
}

// 案件更新
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveAkiyaCaseAccess(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: '不正なリクエストです' }, { status: 400 })

  if (body.plan !== undefined && !isAkiyaPlan(body.plan)) {
    return NextResponse.json({ error: '無効なプランです' }, { status: 400 })
  }
  if (body.status !== undefined && !isAkiyaStatus(body.status)) {
    return NextResponse.json({ error: '無効なステータスです' }, { status: 400 })
  }

  const data: Record<string, any> = {}
  if (typeof body.propertyAddress === 'string' && body.propertyAddress.trim()) {
    data.propertyAddress = body.propertyAddress.trim().slice(0, 500)
  }
  if (body.plan !== undefined) data.plan = body.plan
  if (body.status !== undefined) data.status = body.status
  if (body.note !== undefined) data.note = (typeof body.note === 'string' && body.note.trim()) ? body.note : null
  for (const key of ['startDate', 'endDate', 'nextVisitAt'] as const) {
    if (key in body) {
      if (!body[key]) { data[key] = null; continue }
      const d = new Date(body[key])
      if (!isNaN(d.getTime())) data[key] = d
    }
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: '更新項目がありません' }, { status: 400 })
  }

  const updated = await prisma.akiyaCase.update({
    where: { id },
    data,
    select: { id: true, propertyAddress: true, startDate: true, endDate: true, plan: true, status: true, note: true, nextVisitAt: true, lastVisitedAt: true, updatedAt: true },
  })
  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, memberId: sessionUser.memberId ?? null, action: '空き家管理案件を更新', req: request })
  return NextResponse.json(updated)
}

// 案件削除（記録・明細はCascade。写真blobはベストエフォートで削除）
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveAkiyaCaseAccess(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  // 削除前に写真URLを収集（案件写真＋全記録の項目写真）
  const items = await prisma.akiyaRecordItem.findMany({
    where: { record: { akiyaCaseId: id } },
    select: { photoUrls: true },
  })
  const urls = [
    ...parsePhotoUrls(access.akiyaCase.photoUrls),
    ...items.flatMap(i => parsePhotoUrls(i.photoUrls)),
  ]

  await prisma.akiyaCase.delete({ where: { id } })
  for (const url of urls) { try { await deleteFile(url) } catch { /* ignore */ } }

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, memberId: sessionUser.memberId ?? null, action: '空き家管理案件を削除', req: request })
  return NextResponse.json({ ok: true })
}
