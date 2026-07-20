import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteFile } from '@/lib/storage'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

async function resolveRecording(dealId: string, recId: string, sessionUser: any) {
  const rec = await prisma.dealRecording.findUnique({
    where: { id: recId },
    select: { id: true, dealId: true, audioUrl: true, status: true, attempts: true, deal: { select: { storeId: true } } },
  })
  if (!rec || rec.dealId !== dealId) return { error: '録音が見つかりません', status: 404 as const }
  const isStore = sessionUser.role === 'store'
  const isAdmin = ADMIN_ROLES.includes(sessionUser.role)
  if (!isStore && !isAdmin) return { error: 'Forbidden', status: 403 as const }
  if (isStore && rec.deal.storeId !== sessionUser.id) return { error: 'Forbidden', status: 403 as const }
  return { rec }
}

// 録音の削除（音声Blobも削除）
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; recId: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, recId } = await params
  const access = await resolveRecording(id, recId, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  try { await deleteFile(access.rec.audioUrl) } catch { /* Blob削除失敗は無視 */ }
  await prisma.dealRecording.delete({ where: { id: recId } })
  return NextResponse.json({ ok: true })
}

// AI解析の再試行（error/doneをpendingに戻す）
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string; recId: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, recId } = await params
  const access = await resolveRecording(id, recId, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  await prisma.dealRecording.update({
    where: { id: recId },
    data: { status: 'pending', error: null, attempts: 0 },
  })
  return NextResponse.json({ ok: true })
}
