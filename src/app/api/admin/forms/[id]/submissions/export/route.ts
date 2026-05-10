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
  const headers = ['id', '送信日時', ...schema.filter(f => f.type !== 'heading' && f.type !== 'paragraph').map(f => (f as any).label)]

  const submissions = await prisma.formSubmission.findMany({
    where: { formId: id },
    orderBy: { createdAt: 'desc' },
  })

  const rows = submissions.map(s => {
    let data: Record<string, unknown> = {}
    try { data = JSON.parse(s.data) } catch { /* ignore */ }
    const fields = formatAnswersForDisplay(schema, data)
    return [s.id, s.createdAt.toISOString(), ...fields.map(f => f.value)]
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
