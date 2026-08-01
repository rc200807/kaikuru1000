import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendLineReply } from '@/lib/line-reply'
import { expandPlaceholders } from '@/lib/line-scenario'
import { z } from 'zod'

const testSchema = z.object({
  lineUserId: z.string().min(1), // LineUser の内部ID
})

// POST /api/admin/line-scenarios/[id]/test — 指定 LINE ユーザーへ全ステップを即時テスト送信
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user || !['admin','superadmin','hr'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = testSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }

  const scenario = await prisma.lineScenario.findUnique({
    where: { id },
    include: { steps: { orderBy: { order: 'asc' } } },
  })
  if (!scenario) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const lineUser = await prisma.lineUser.findUnique({
    where: { id: parsed.data.lineUserId },
    include: {
      user: { select: { name: true } },
      store: { select: { name: true } },
    },
  })
  if (!lineUser) return NextResponse.json({ error: 'LINEユーザーが見つかりません' }, { status: 404 })

  const ctx = {
    name: lineUser.user?.name ?? lineUser.displayName,
    storeName: lineUser.store?.name ?? null,
  }

  let sent = 0
  for (const step of scenario.steps) {
    const content = `【テスト送信 ${step.order + 1}/${scenario.steps.length}】\n${expandPlaceholders(step.content, ctx)}`
    const result = await sendLineReply(lineUser.id, content)
    if (!result.ok) {
      return NextResponse.json(
        { error: `ステップ${step.order + 1}の送信に失敗しました: ${result.error}`, sent },
        { status: 502 }
      )
    }
    sent++
  }

  return NextResponse.json({ success: true, sent })
}
