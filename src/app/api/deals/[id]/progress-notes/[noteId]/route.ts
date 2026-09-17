import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { normalizeNoteInput, serializeProgressNote, PROGRESS_NOTE_SELECT } from '@/lib/deal-progress-notes'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

/**
 * 対応状況メモの編集・削除。
 * 書き換えられるのは店舗ポータル（自店舗の案件）のみ。管理ポータルは閲覧専用。
 * noteId が別案件のメモを指していないかもここで確かめる（URL の付け替え対策）。
 */
async function resolveNote(dealId: string, noteId: string, sessionUser: any) {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true, storeId: true } })
  if (!deal) return { error: '案件が見つかりません', status: 404 as const }
  const isStore = sessionUser?.role === 'store'
  const isAdmin = ADMIN_ROLES.includes(sessionUser?.role)
  if (!isStore && !isAdmin) return { error: 'Forbidden', status: 403 as const }
  if (isStore && deal.storeId !== sessionUser.id) return { error: 'Forbidden', status: 403 as const }
  if (!isStore) return { error: '対応状況を編集できるのは店舗のみです', status: 403 as const }

  const note = await prisma.dealProgressNote.findUnique({ where: { id: noteId }, select: { id: true, dealId: true } })
  if (!note || note.dealId !== dealId) return { error: '対応状況が見つかりません', status: 404 as const }
  return { note }
}

// 対応状況を編集
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, noteId } = await params
  const access = await resolveNote(id, noteId, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const input = normalizeNoteInput(await request.json().catch(() => null))
  if (typeof input === 'string') return NextResponse.json({ error: input }, { status: 400 })

  const updated = await prisma.dealProgressNote.update({
    where: { id: noteId },
    data: { title: input.title, body: input.body },
    select: PROGRESS_NOTE_SELECT,
  })

  await recordAccessLog({
    userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name,
    memberId: sessionUser.memberId ?? null, action: '案件の対応状況を編集', req: request,
  })

  return NextResponse.json(serializeProgressNote(updated))
}

// 対応状況を削除
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, noteId } = await params
  const access = await resolveNote(id, noteId, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  await prisma.dealProgressNote.delete({ where: { id: noteId } })

  await recordAccessLog({
    userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name,
    memberId: sessionUser.memberId ?? null, action: '案件の対応状況を削除', req: request,
  })

  return NextResponse.json({ success: true })
}
