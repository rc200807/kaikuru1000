import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { loadDealRecordings, serializeRecording } from '@/lib/deal-recordings'
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

// 案件の会話録音一覧
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveDeal(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  // 中身は src/lib/deal-recordings.ts に集約（案件詳細GET が同じ関数で畳み込む）
  return NextResponse.json({ recordings: await loadDealRecordings(id) })
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

  // 登録直後は status=pending で文字起こしはまだ無い
  return NextResponse.json(serializeRecording(created, false), { status: 201 })
}
