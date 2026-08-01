import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const stepSchema = z.object({
  delayMinutes: z.number().int().min(0).max(60 * 24 * 365),
  sendHour: z.number().int().min(0).max(23).nullable().optional(),
  content: z.string().min(1).max(2000),
})

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  triggerType: z.enum(['registration', 'follow', 'keyword']).optional(),
  keyword: z.string().max(100).nullable().optional(),
  storeId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  steps: z.array(stepSchema).min(1).max(20).optional(),
})

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user || !['admin','superadmin','hr'].includes(user.role)) return null
  return user
}

// PATCH /api/admin/line-scenarios/[id] — シナリオ更新
// steps を渡すと全ステップを置き換え、旧ステップ由来の未送信キューはキャンセルされる
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }

  const existing = await prisma.lineScenario.findUnique({
    where: { id },
    include: { steps: true },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const data: any = {}
  if (parsed.data.name !== undefined)        data.name = parsed.data.name
  if (parsed.data.triggerType !== undefined) data.triggerType = parsed.data.triggerType
  if (parsed.data.keyword !== undefined)     data.keyword = parsed.data.keyword?.trim() || null
  if (parsed.data.storeId !== undefined)     data.storeId = parsed.data.storeId
  if (parsed.data.isActive !== undefined)    data.isActive = parsed.data.isActive

  const scenario = await prisma.$transaction(async (tx) => {
    if (parsed.data.steps) {
      // 旧ステップ由来の未送信キューをキャンセルしてからステップを全置換
      const oldStepIds = existing.steps.map((s) => s.id)
      if (oldStepIds.length > 0) {
        await tx.lineMessageQueue.updateMany({
          where: { scenarioStepId: { in: oldStepIds }, status: { in: ['pending', 'failed'] } },
          data: { status: 'cancelled' },
        })
      }
      await tx.lineScenarioStep.deleteMany({ where: { scenarioId: id } })
      await tx.lineScenarioStep.createMany({
        data: parsed.data.steps.map((s, i) => ({
          scenarioId: id,
          order: i,
          delayMinutes: s.delayMinutes,
          sendHour: s.sendHour ?? null,
          content: s.content,
        })),
      })
    }
    // 無効化時は未送信キューもキャンセル
    if (parsed.data.isActive === false) {
      const stepIds = (await tx.lineScenarioStep.findMany({ where: { scenarioId: id }, select: { id: true } })).map((s) => s.id)
      if (stepIds.length > 0) {
        await tx.lineMessageQueue.updateMany({
          where: { scenarioStepId: { in: stepIds }, status: { in: ['pending', 'failed'] } },
          data: { status: 'cancelled' },
        })
      }
    }
    return tx.lineScenario.update({
      where: { id },
      data,
      include: { steps: { orderBy: { order: 'asc' } } },
    })
  })

  return NextResponse.json(scenario)
}

// DELETE /api/admin/line-scenarios/[id] — シナリオ削除（未送信キューはキャンセル）
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await prisma.lineScenario.findUnique({
    where: { id },
    include: { steps: { select: { id: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.$transaction(async (tx) => {
    const stepIds = existing.steps.map((s) => s.id)
    if (stepIds.length > 0) {
      await tx.lineMessageQueue.updateMany({
        where: { scenarioStepId: { in: stepIds }, status: { in: ['pending', 'failed'] } },
        data: { status: 'cancelled' },
      })
    }
    await tx.lineScenario.delete({ where: { id } })
  })

  return NextResponse.json({ success: true })
}
