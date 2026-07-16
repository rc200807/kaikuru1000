import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireSysAdmin } from '@/lib/sysadmin-auth'

export const runtime = 'nodejs'

const CATEGORIES = ['feature', 'improvement', 'fix', 'notice'] as const

const updateSchema = z.object({
  version: z.string().max(40).nullable().optional(),
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(1).optional(),
  category: z.enum(CATEGORIES).optional(),
  targetStore: z.boolean().optional(),
  targetAdmin: z.boolean().optional(),
  isPublished: z.boolean().optional(),
})

/** リリースノート更新（編集 / 公開トグル） */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const parsed = updateSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const d = parsed.data

  const existing = await prisma.releaseNote.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const nextTargetStore = d.targetStore ?? existing.targetStore
  const nextTargetAdmin = d.targetAdmin ?? existing.targetAdmin
  if (!nextTargetStore && !nextTargetAdmin) {
    return NextResponse.json({ error: '配信先を1つ以上選択してください' }, { status: 400 })
  }

  // 公開状態が変わる場合の publishedAt 制御（公開時に未設定なら now、非公開化で null）
  let publishedAt = existing.publishedAt
  if (d.isPublished !== undefined && d.isPublished !== existing.isPublished) {
    publishedAt = d.isPublished ? (existing.publishedAt ?? new Date()) : null
  }

  const note = await prisma.releaseNote.update({
    where: { id },
    data: {
      version: d.version !== undefined ? (d.version?.trim() || null) : undefined,
      title: d.title?.trim(),
      content: d.content,
      category: d.category,
      targetStore: d.targetStore,
      targetAdmin: d.targetAdmin,
      isPublished: d.isPublished,
      publishedAt,
    },
    include: { author: { select: { name: true } } },
  })

  return NextResponse.json(note)
}

/** リリースノート削除 */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const existing = await prisma.releaseNote.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.releaseNote.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
