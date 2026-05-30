import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encrypt'
import { parseSchema, type FormSchema } from '@/lib/forms/types'
import { buildExternalPayload, parseHeaders, postToExternalApi } from '@/lib/forms/externalApi'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin', 'superadmin', 'hr'].includes(user?.role)) return null
  return user
}

/** スキーマからサンプル回答を生成（直近の回答が無いとき用） */
function sampleAnswers(schema: FormSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of schema) {
    switch (f.type) {
      case 'text': case 'textarea': out[f.id] = 'サンプルテキスト'; break
      case 'email': out[f.id] = 'test@example.com'; break
      case 'phone': out[f.id] = '09012345678'; break
      case 'number': out[f.id] = '123'; break
      case 'date': out[f.id] = '2026-01-01'; break
      case 'select': case 'radio': out[f.id] = f.options[0] ?? ''; break
      case 'checkbox': out[f.id] = f.options.slice(0, 1); break
      case 'name': out[f.id] = { last: '山田', first: '太郎' }; break
      case 'prefecture': out[f.id] = '東京都'; break
      default: break
    }
  }
  return out
}

/** 機密値（APIキー）をマスクしてプレビュー用に変換 */
function maskSecret<T>(obj: T, secret: string): T {
  if (!secret) return obj
  try {
    return JSON.parse(JSON.stringify(obj).split(secret).join('********')) as T
  } catch {
    return obj
  }
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const form = await prisma.form.findUnique({ where: { id } })
  if (!form) return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  if (!form.externalApiUrl) {
    return NextResponse.json({ error: '送信先URLが設定されていません。先に保存してください。' }, { status: 400 })
  }

  const schema = parseSchema(form.schema)

  // 直近の回答があれば実データ、無ければサンプル
  const latest = await prisma.formSubmission.findFirst({
    where: { formId: id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, data: true, createdAt: true },
  })
  let answers: Record<string, unknown> = {}
  if (latest?.data) {
    try { answers = JSON.parse(latest.data) } catch { answers = {} }
  }
  if (Object.keys(answers).length === 0) answers = sampleAnswers(schema)

  const apiKey = form.externalApiKeyEnc ? decrypt(form.externalApiKeyEnc) : ''
  let fieldMap: Record<string, string> = {}
  try { fieldMap = form.externalApiFieldMap ? JSON.parse(form.externalApiFieldMap) : {} } catch { fieldMap = {} }

  let payload: Record<string, any>
  let headers: Record<string, string>
  try {
    payload = buildExternalPayload({
      schema,
      staticFieldsJson: form.externalApiStaticFields,
      fieldMap,
      answers,
      submissionId: latest?.id ?? 'TEST-SUBMISSION-ID',
      submittedAt: latest?.createdAt ?? new Date(),
      apiKey,
    })
    headers = parseHeaders(form.externalApiHeaders, apiKey)
  } catch (e: any) {
    return NextResponse.json({ error: `ペイロード組み立てエラー: ${e?.message || String(e)}（ヘッダー/固定フィールドのJSONを確認してください）` }, { status: 400 })
  }

  const r = await postToExternalApi({ url: form.externalApiUrl, headers, payload })

  return NextResponse.json({
    ok: r.ok,
    status: r.status ?? null,
    error: r.error ?? null,
    responseBody: r.body ?? '',
    usedSample: !latest,
    requestPreview: {
      url: form.externalApiUrl,
      headers: maskSecret({ 'Content-Type': 'application/json', ...headers }, apiKey),
      payload: maskSecret(payload, apiKey),
    },
  })
}
