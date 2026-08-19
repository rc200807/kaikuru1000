import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { generateSlug } from '@/lib/forms/slug'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(user?.role)) return null
  return user as { id: string; role: string }
}

/** フォーム一覧（管理者用） */
export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const forms = await prisma.form.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { submissions: true } } },
  })
  return NextResponse.json(forms.map(f => ({ ...f, submissionCount: f._count.submissions, _count: undefined })))
}

/** フォーム新規作成 */
export async function POST(request: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const title = (body?.title ?? '').toString().trim() || '新しいフォーム'
  const internalName = (body?.internalName ?? '').toString().trim() || null

  // slug 衝突回避
  let slug = generateSlug()
  for (let i = 0; i < 3; i++) {
    const exists = await prisma.form.findUnique({ where: { slug } })
    if (!exists) break
    slug = generateSlug()
  }

  const form = await prisma.form.create({
    data: {
      slug,
      title,
      internalName,
      schema: '[]',
      status: 'draft',
      createdById: user.id,
    },
  })
  return NextResponse.json(form, { status: 201 })
}
