import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import {
  loadDealProgressNotes,
  normalizeNoteInput,
  serializeProgressNote,
  PROGRESS_NOTE_SELECT,
} from '@/lib/deal-progress-notes'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

/**
 * 案件の対応状況メモ。
 * 閲覧は店舗（自店舗の案件のみ）と管理ポータル、記入は店舗ポータルのみ
 * （管理ポータルは店舗が残した経過を確認する側）。
 */
async function resolveDeal(id: string, sessionUser: any) {
  const deal = await prisma.deal.findUnique({ where: { id }, select: { id: true, storeId: true } })
  if (!deal) return { error: '案件が見つかりません', status: 404 as const }
  const isStore = sessionUser?.role === 'store'
  const isAdmin = ADMIN_ROLES.includes(sessionUser?.role)
  if (!isStore && !isAdmin) return { error: 'Forbidden', status: 403 as const }
  if (isStore && deal.storeId !== sessionUser.id) return { error: 'Forbidden', status: 403 as const }
  return { deal, isStore }
}

// 対応状況の一覧（新しい順）
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveDeal(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  return NextResponse.json({ progressNotes: await loadDealProgressNotes(id) })
}

// 対応状況を追加（店舗ポータルのみ）
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveDeal(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })
  if (!access.isStore) return NextResponse.json({ error: '対応状況を記入できるのは店舗のみです' }, { status: 403 })

  const input = normalizeNoteInput(await request.json().catch(() => null))
  if (typeof input === 'string') return NextResponse.json({ error: input }, { status: 400 })

  const created = await prisma.dealProgressNote.create({
    data: {
      dealId: id,
      title: input.title,
      body: input.body,
      // 記入者はスナップショット（店舗メンバーでログインしていればメンバー名が入る）
      createdByType: sessionUser.role ?? null,
      createdById: sessionUser.memberId ?? sessionUser.id ?? null,
      createdByName: sessionUser.name ?? null,
    },
    select: PROGRESS_NOTE_SELECT,
  })

  await recordAccessLog({
    userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name,
    memberId: sessionUser.memberId ?? null, action: '案件の対応状況を記入', req: request,
  })

  return NextResponse.json(serializeProgressNote(created), { status: 201 })
}
