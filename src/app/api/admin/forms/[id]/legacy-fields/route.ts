import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseSchema, isInputField } from '@/lib/forms/types'
import { collectUnassignedAnswers, parseLegacyFieldMap, suggestLegacyTarget } from '@/lib/forms/legacy-field-map'

/**
 * 設問を作り直したことで現在の設問に結びつかなくなった回答キーを洗い出す。
 * 保存済みの回答すべてを対象にするため、回答一覧のページングとは別に集計する。
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as { role?: string } | undefined
  if (!session || !['admin', 'superadmin', 'hr'].includes(user?.role ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const form = await prisma.form.findUnique({ where: { id }, select: { id: true, schema: true, legacyFieldMap: true } })
  if (!form) return NextResponse.json({ error: 'Not Found' }, { status: 404 })

  const schema = parseSchema(form.schema)
  const map = parseLegacyFieldMap(form.legacyFieldMap)

  const submissions = await prisma.formSubmission.findMany({
    where: { formId: id },
    select: { data: true },
    orderBy: { createdAt: 'desc' },
    take: 2000,
  })
  const dataList = submissions.map((s) => {
    try {
      const parsed = JSON.parse(s.data || '{}')
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  })

  const unassigned = collectUnassignedAnswers(schema, dataList, map).map((u) => ({
    ...u,
    suggestedFieldId: suggestLegacyTarget(schema, u.samples),
  }))

  return NextResponse.json({
    unassigned,
    map,
    questions: schema.filter(isInputField).map((f) => ({ id: f.id, label: f.label, type: f.type })),
  })
}
