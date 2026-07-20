import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

// 録音音声の認証付き配信（生のBlob URLを露出させない）。案件の所有権を確認してからストリーム。
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; recId: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, recId } = await params
  const rec = await prisma.dealRecording.findUnique({
    where: { id: recId },
    select: { dealId: true, audioUrl: true, mimeType: true, deal: { select: { storeId: true } } },
  })
  if (!rec || rec.dealId !== id) return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  const isStore = sessionUser.role === 'store'
  const isAdmin = ADMIN_ROLES.includes(sessionUser.role)
  if (!isStore && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (isStore && rec.deal.storeId !== sessionUser.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ローカル開発（/uploads/…）はリダイレクト
  if (rec.audioUrl.startsWith('/')) return NextResponse.redirect(new URL(rec.audioUrl, _request.url))

  const upstream = await fetch(rec.audioUrl)
  if (!upstream.ok || !upstream.body) return NextResponse.json({ error: '音声を取得できません' }, { status: 502 })
  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': rec.mimeType || upstream.headers.get('content-type') || 'audio/mpeg',
      'Content-Length': upstream.headers.get('content-length') ?? '',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
