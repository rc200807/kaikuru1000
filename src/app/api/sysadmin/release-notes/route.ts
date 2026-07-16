import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireSysAdmin } from '@/lib/sysadmin-auth'

export const runtime = 'nodejs'

const CATEGORIES = ['feature', 'improvement', 'fix', 'notice'] as const

const createSchema = z.object({
  version: z.string().max(40).nullable().optional(),
  title: z.string().min(1, 'タイトルは必須です').max(200),
  content: z.string().min(1, '本文は必須です'),
  category: z.enum(CATEGORIES).default('feature'),
  targetStore: z.boolean().default(true),
  targetAdmin: z.boolean().default(true),
  isPublished: z.boolean().default(false),
})

/** リリースノート一覧（運営用 - 下書き含む全件） */
export async function GET() {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const notes = await prisma.releaseNote.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      author: { select: { name: true } },
      _count: { select: { reads: true } },
    },
  })

  const result = notes.map(n => ({
    id: n.id,
    version: n.version,
    title: n.title,
    content: n.content,
    category: n.category,
    targetStore: n.targetStore,
    targetAdmin: n.targetAdmin,
    isPublished: n.isPublished,
    publishedAt: n.publishedAt,
    author: n.author,
    readCount: n._count.reads,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  }))

  return NextResponse.json(result)
}

/** リリースノート作成 */
export async function POST(req: NextRequest) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const d = parsed.data

  if (!d.targetStore && !d.targetAdmin) {
    return NextResponse.json({ error: '配信先を1つ以上選択してください' }, { status: 400 })
  }

  const note = await prisma.releaseNote.create({
    data: {
      version: d.version?.trim() || null,
      title: d.title.trim(),
      content: d.content,
      category: d.category,
      targetStore: d.targetStore,
      targetAdmin: d.targetAdmin,
      isPublished: d.isPublished,
      publishedAt: d.isPublished ? new Date() : null,
      authorId: user.id,
    },
    include: { author: { select: { name: true } } },
  })

  return NextResponse.json(note, { status: 201 })
}
