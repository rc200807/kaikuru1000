import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

async function resolveDeal(id: string, sessionUser: any) {
  const deal = await prisma.deal.findUnique({ where: { id }, select: { id: true, storeId: true } })
  if (!deal) return { error: '案件が見つかりません', status: 404 as const }
  const isStore = sessionUser.role === 'store'
  const isAdmin = ADMIN_ROLES.includes(sessionUser.role)
  if (!isStore && !isAdmin) return { error: 'Forbidden', status: 403 as const }
  if (isStore && deal.storeId !== sessionUser.id) return { error: 'Forbidden', status: 403 as const }
  return { deal }
}

function serialize(r: any) {
  let summary: unknown = null
  if (r.summary) { try { summary = JSON.parse(r.summary) } catch { summary = null } }
  return {
    id: r.id,
    fileName: r.fileName,
    mimeType: r.mimeType,
    fileSize: r.fileSize,
    durationSec: r.durationSec,
    status: r.status,
    transcript: r.transcript,
    summary,
    error: r.error,
    uploadedByName: r.uploadedByName,
    createdAt: r.createdAt,
    processedAt: r.processedAt,
    audioUrl: `/api/deals/${r.dealId}/recordings/${r.id}/audio`,
  }
}

// 案件の会話録音一覧
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveDeal(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const recordings = await prisma.dealRecording.findMany({ where: { dealId: id }, orderBy: { createdAt: 'desc' } })
  return NextResponse.json({ recordings: recordings.map(serialize) })
}

// 録音アップロード完了後にメタデータを登録（status=pending でAI解析待ち）
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveDeal(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const body = await request.json().catch(() => null)
  const audioUrl = typeof body?.audioUrl === 'string' ? body.audioUrl : ''
  if (!/^https?:\/\//.test(audioUrl)) return NextResponse.json({ error: '音声URLが不正です' }, { status: 400 })

  const created = await prisma.dealRecording.create({
    data: {
      dealId: id,
      audioUrl,
      fileName: typeof body?.fileName === 'string' ? body.fileName.slice(0, 200) : null,
      mimeType: typeof body?.mimeType === 'string' ? body.mimeType.slice(0, 100) : null,
      fileSize: Number.isFinite(body?.fileSize) ? Math.floor(body.fileSize) : null,
      durationSec: Number.isFinite(body?.durationSec) ? Math.floor(body.durationSec) : null,
      status: 'pending',
      uploadedByType: sessionUser.role ?? null,
      uploadedById: sessionUser.id ?? null,
      uploadedByName: sessionUser.name ?? null,
    },
  })

  await recordAccessLog({
    userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name,
    memberId: sessionUser.memberId ?? null, action: '会話録音をアップロード', req: request,
  })

  return NextResponse.json(serialize(created), { status: 201 })
}
