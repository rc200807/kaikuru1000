import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { findLoginRequestByToken, loginRequestState } from '@/lib/admin-login-request'

/**
 * ログインリクエストの状態確認（申請端末からのポーリング用・公開API）。
 * token を持つ申請端末だけが参照できる。{ cancel: true } で取り下げ。
 * token を URL に載せないよう POST で受ける。
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const requestId = typeof body?.requestId === 'string' ? body.requestId : ''
  const token = typeof body?.token === 'string' ? body.token : ''
  if (!requestId || !token) {
    return NextResponse.json({ error: 'リクエストが見つかりません' }, { status: 404 })
  }

  const r = await findLoginRequestByToken(requestId, token)
  if (!r) return NextResponse.json({ error: 'リクエストが見つかりません' }, { status: 404 })

  if (body?.cancel === true) {
    await prisma.adminLoginRequest.updateMany({
      where: { id: r.id, status: { in: ['pending', 'approved'] } },
      data: { status: 'cancelled' },
    })
    return NextResponse.json({ status: 'cancelled' })
  }

  const state = loginRequestState(r)
  return NextResponse.json({
    status: state,
    decidedByName: state === 'approved' || state === 'rejected' ? r.decidedByName : null,
  })
}
