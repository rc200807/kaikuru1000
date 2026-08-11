import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireLinkPartner } from '@/lib/link-partner-auth'
import { resolveAssignedFormIds, LINKPARTNER_SAFE_SUBMISSION_SELECT } from '@/lib/link-partner-query'
import { recordLinkPartnerActivity } from '@/lib/link-partner-activity'
import { parseSchema, isInputField, type FormSchema } from '@/lib/forms/types'
import { formatAnswersForDisplay } from '@/lib/forms/buildZodFromSchema'
import { applyLegacyFieldMap, parseLegacyFieldMap } from '@/lib/forms/legacy-field-map'

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
    return '"' + v.replace(/"/g, '""') + '"'
  }
  return v
}
const jst = (d: Date) => new Date(d).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })

/**
 * フォームの入力項目に対する列名を、schema の並び順で返す。
 * 返り値の並びは formatAnswersForDisplay() の出力と 1:1 で対応する（どちらも装飾項目を除いた schema 順）。
 * 同一フォーム内でラベルが重複する場合は「ラベル (2)」のように連番を付けて列を分ける。
 */
function columnNamesForSchema(schema: FormSchema): string[] {
  const used = new Map<string, number>()
  return schema.filter(isInputField).map((f) => {
    const base = f.label?.trim() || '（無題項目）'
    const n = (used.get(base) ?? 0) + 1
    used.set(base, n)
    return n === 1 ? base : `${base} (${n})`
  })
}

// 問い合わせCSVエクスポート（割当フォームのみ・BOM付きUTF-8）
// 回答は項目ごとに列を分ける。複数フォームをまとめて出力する場合は全フォームの列を和集合にし、
// 同名の列は共有する（フォームが違っても同じ設問なら同じ列に入る）。
export async function GET(req: Request) {
  const user = await requireLinkPartner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formIds = await resolveAssignedFormIds(user.linkPartnerId)
  const url = new URL(req.url)
  const formFilter = url.searchParams.get('formId')
  const where =
    formFilter && formIds.includes(formFilter) ? { formId: formFilter } : { formId: { in: formIds } }

  const submissions = formIds.length
    ? await prisma.formSubmission.findMany({ where, select: LINKPARTNER_SAFE_SUBMISSION_SELECT, orderBy: { createdAt: 'desc' } })
    : []

  // フォームごとに schema を1度だけ解析し、列名を決める
  const schemaByForm = new Map<string, FormSchema>()
  const columnsByForm = new Map<string, string[]>()
  const schemaOf = (s: (typeof submissions)[number]) => {
    let schema = schemaByForm.get(s.formId)
    if (!schema) {
      schema = parseSchema(s.form.schema)
      schemaByForm.set(s.formId, schema)
      columnsByForm.set(s.formId, columnNamesForSchema(schema))
    }
    return schema
  }

  // 回答を「列名 → 値」に変換。スキーマの項目は設問順、それ以外（設問の作り直しなどで
  // スキーマに残っていないキー）はその後ろに続く。
  const valuesByRow = submissions.map((s) => {
    const values = new Map<string, string>()
    try {
      const schema = schemaOf(s)
      const names = columnsByForm.get(s.formId) ?? []
      const raw = JSON.parse(s.data || '{}')
      // 設問を作り直して項目IDが変わった回答は、対応表で現在の設問の列に寄せる
      const data = applyLegacyFieldMap(schema, raw, parseLegacyFieldMap(s.form.legacyFieldMap))
      formatAnswersForDisplay(schema, data, { includeUnknown: true }).forEach((a, i) => {
        const name = i < names.length ? names[i] : a.label
        if (!values.has(name)) values.set(name, a.value)
      })
    } catch {
      // 壊れた回答データは空欄で出力する
      for (const name of columnsByForm.get(s.formId) ?? []) values.set(name, '')
    }
    return values
  })

  const answerColumns: string[] = []
  const seen = new Set<string>()
  for (const values of valuesByRow) {
    for (const name of values.keys()) {
      if (seen.has(name)) continue
      seen.add(name)
      answerColumns.push(name)
    }
  }

  const headers = ['受信日時', 'フォーム', '顧客名', ...answerColumns]
  const rows = submissions.map((s, i) => [
    jst(s.createdAt),
    s.form.title,
    s.user?.name ?? '',
    ...answerColumns.map((name) => valuesByRow[i].get(name) ?? ''),
  ])
  const csv = [headers, ...rows].map((row) => row.map((cell) => csvEscape(String(cell ?? ''))).join(',')).join('\r\n')
  const body = '﻿' + csv

  await recordLinkPartnerActivity({
    linkPartnerId: user.linkPartnerId, memberId: user.id, memberName: user.name,
    action: 'export_inquiries', targetType: 'inquiry', req,
  })

  const filename = `linkpartner-inquiries-${new Date().toISOString().slice(0, 10)}.csv`
  return new NextResponse(body, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` },
  })
}
