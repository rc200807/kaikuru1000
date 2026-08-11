import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseSchema } from '@/lib/forms/types'
import { formatAnswersForDisplay } from '@/lib/forms/buildZodFromSchema'

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
    return '"' + v.replace(/"/g, '""') + '"'
  }
  return v
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(user?.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const form = await prisma.form.findUnique({ where: { id } })
  if (!form) return NextResponse.json({ error: 'Not Found' }, { status: 404 })

  const schema = parseSchema(form.schema)
  const fieldLabels = schema.filter(f => f.type !== 'heading' && f.type !== 'paragraph').map(f => (f as any).label as string)

  const submissions = await prisma.formSubmission.findMany({
    where: { formId: id },
    orderBy: { createdAt: 'desc' },
  })

  // 設問の作り直しなどで現在のスキーマに無いキーの回答も、末尾に列を足して出力する
  const answered = submissions.map(s => {
    let data: Record<string, unknown> = {}
    try { data = JSON.parse(s.data) } catch { /* ignore */ }
    return formatAnswersForDisplay(schema, data, { includeUnknown: true })
  })
  const extraLabels: string[] = []
  for (const fields of answered) {
    for (const f of fields.slice(fieldLabels.length)) {
      if (!extraLabels.includes(f.label)) extraLabels.push(f.label)
    }
  }

  const headers = ['id', '送信日時', ...fieldLabels, ...extraLabels]
  const rows = submissions.map((s, i) => {
    const fields = answered[i]
    const extras = new Map(fields.slice(fieldLabels.length).map(f => [f.label, f.value]))
    return [
      s.id,
      s.createdAt.toISOString(),
      ...fields.slice(0, fieldLabels.length).map(f => f.value),
      ...extraLabels.map(l => extras.get(l) ?? ''),
    ]
  })

  const csv = [headers, ...rows].map(row => row.map(c => csvEscape(String(c ?? ''))).join(',')).join('\r\n')
  // BOM 付き UTF-8（Excel 対応）
  const body = '﻿' + csv

  const filename = `form-${form.slug}-${new Date().toISOString().slice(0, 10)}.csv`
  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
