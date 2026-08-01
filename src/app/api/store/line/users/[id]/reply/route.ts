import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { resolveStoreScope } from '@/lib/store-scope'
import { sendLineReply } from '@/lib/line-reply'
import { z } from 'zod'

const replySchema = z.object({
  text: z.string().min(1).max(2000),
})

// POST /api/store/line/users/[id]/reply — 自店舗スコープの LINE ユーザーへ返信
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = replySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }

  // 帰属検証: 閲覧できる相手（スコープ内店舗に割当）にのみ返信できる
  const scope = await resolveStoreScope(user.id as string, request.nextUrl.searchParams.get('storeIds'))
  const lineUser = await prisma.lineUser.findUnique({ where: { id } })
  if (!lineUser || !lineUser.storeId || !scope.storeIds.includes(lineUser.storeId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const result = await sendLineReply(id, parsed.data.text)
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.message ? { message: result.message } : {}) },
      { status: result.status }
    )
  }
  return NextResponse.json(result.message)
}
