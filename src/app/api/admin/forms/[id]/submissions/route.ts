import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(user?.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const url = new URL(req.url)
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50))

  const [form, total, submissions] = await Promise.all([
    prisma.form.findUnique({ where: { id }, select: { id: true, title: true, schema: true, legacyFieldMap: true } }),
    prisma.formSubmission.count({ where: { formId: id } }),
    prisma.formSubmission.findMany({
      where: { formId: id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])
  if (!form) return NextResponse.json({ error: 'Not Found' }, { status: 404 })

  return NextResponse.json({ form, total, page, limit, submissions })
}
