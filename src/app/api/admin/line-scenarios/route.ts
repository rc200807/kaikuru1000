import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDecryptedAccessToken, getQuotaConsumption, getMessageQuota } from '@/lib/line'
import { z } from 'zod'

const stepSchema = z.object({
  delayMinutes: z.number().int().min(0).max(60 * 24 * 365),
  sendHour: z.number().int().min(0).max(23).nullable().optional(),
  content: z.string().min(1).max(2000),
})

const createSchema = z.object({
  name: z.string().min(1).max(100),
  triggerType: z.enum(['registration', 'follow', 'keyword']),
  keyword: z.string().max(100).nullable().optional(),
  storeId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  steps: z.array(stepSchema).min(1).max(20),
}).refine((d) => d.triggerType !== 'keyword' || (d.keyword && d.keyword.trim().length > 0), {
  message: 'キーワード応答にはキーワードが必須です',
})

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user || !['admin','superadmin','hr'].includes(user.role)) return null
  return user
}

// GET /api/admin/line-scenarios — シナリオ一覧（既定チャネル + 配信数 + クォータ）
export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const channel = await prisma.lineChannel.findFirst({
    where: { isDefault: true, isActive: true },
  })
  if (!channel) {
    return NextResponse.json({ channel: null, scenarios: [], quota: null })
  }

  const scenarios = await prisma.lineScenario.findMany({
    where: { lineChannelId: channel.id },
    include: {
      steps: { orderBy: { order: 'asc' } },
      store: { select: { id: true, name: true } },
      _count: { select: { enrollments: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // 今月のメッセージ使用通数（無料枠監視。失敗しても一覧は返す）
  let quota: { totalUsage: number; limit: number | null } | null = null
  try {
    const token = getDecryptedAccessToken(channel)
    const [consumption, messageQuota] = await Promise.all([
      getQuotaConsumption(token),
      getMessageQuota(token),
    ])
    quota = { totalUsage: consumption.totalUsage, limit: messageQuota.value ?? null }
  } catch { /* ignore */ }

  return NextResponse.json({
    channel: { id: channel.id, name: channel.name },
    scenarios: scenarios.map((s) => ({
      id: s.id,
      name: s.name,
      triggerType: s.triggerType,
      keyword: s.keyword,
      store: s.store,
      isActive: s.isActive,
      steps: s.steps.map((st) => ({
        id: st.id, order: st.order, delayMinutes: st.delayMinutes, sendHour: st.sendHour, content: st.content,
      })),
      enrollmentCount: s._count.enrollments,
      createdAt: s.createdAt,
    })),
    quota,
  })
}

// POST /api/admin/line-scenarios — シナリオ作成（ステップ込み）
export async function POST(request: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }

  const channel = await prisma.lineChannel.findFirst({
    where: { isDefault: true, isActive: true },
  })
  if (!channel) {
    return NextResponse.json({ error: '既定チャネルが設定されていません。LINE管理のチャネル編集から設定してください。' }, { status: 400 })
  }

  const { name, triggerType, keyword, storeId, isActive, steps } = parsed.data
  const scenario = await prisma.lineScenario.create({
    data: {
      name,
      lineChannelId: channel.id,
      triggerType,
      keyword: triggerType === 'keyword' ? keyword?.trim() ?? null : null,
      storeId: storeId ?? null,
      isActive: isActive ?? true,
      steps: {
        create: steps.map((s, i) => ({
          order: i,
          delayMinutes: s.delayMinutes,
          sendHour: s.sendHour ?? null,
          content: s.content,
        })),
      },
    },
    include: { steps: { orderBy: { order: 'asc' } } },
  })

  return NextResponse.json(scenario, { status: 201 })
}
