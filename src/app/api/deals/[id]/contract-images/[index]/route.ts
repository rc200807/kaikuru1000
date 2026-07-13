import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 紙契約書写真の認証付き配信プロキシ（保存先URLを直接露出しない）。
// 店舗は自店舗の案件のみ、管理者は全件。顧客は不可。

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; index: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, index } = await params
  const deal = await prisma.deal.findUnique({ where: { id }, select: { storeId: true, paperContractImages: true } })
  if (!deal) return NextResponse.json({ error: '見つかりません' }, { status: 404 })

  const isAdmin = ADMIN_ROLES.includes(sessionUser.role)
  if (!isAdmin && !(sessionUser.role === 'store' && deal.storeId === sessionUser.id)) {
    return NextResponse.json({ error: 'アクセス権限がありません' }, { status: 403 })
  }

  let list: string[] = []
  try { const a = JSON.parse(deal.paperContractImages || '[]'); if (Array.isArray(a)) list = a } catch { /* ignore */ }
  const url = list[parseInt(index, 10)]
  if (!url) return NextResponse.json({ error: '画像が見つかりません' }, { status: 404 })

  // ローカル開発（/uploads/...）はリダイレクト、本番（Blob https URL）はプロキシ配信
  if (!url.startsWith('https://')) return NextResponse.redirect(new URL(url, request.url))

  const res = await fetch(url)
  if (!res.ok) return NextResponse.json({ error: '画像の取得に失敗しました' }, { status: 502 })
  const buf = Buffer.from(await res.arrayBuffer())
  return new NextResponse(buf as any, {
    headers: {
      'Content-Type': res.headers.get('content-type') || 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
