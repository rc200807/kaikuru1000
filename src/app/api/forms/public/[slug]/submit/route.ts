import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { parseSchema } from '@/lib/forms/types'
import { buildZodFromSchema, formatAnswersForDisplay } from '@/lib/forms/buildZodFromSchema'
import { verifyRecaptcha } from '@/lib/recaptcha'
import { postToSheetWebhook } from '@/lib/forms/sheetWebhook'
import { sendFormSubmissionNotification } from '@/lib/mailer'

// 簡易メモリレート制限（IP+slug ごと、60秒で10リクエストまで）
const rateBucket = new Map<string, { count: number; resetAt: number }>()
function checkRateLimit(key: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now()
  const entry = rateBucket.get(key)
  if (!entry || entry.resetAt < now) {
    rateBucket.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (entry.count >= limit) return false
  entry.count++
  return true
}

function getIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const ip = getIp(req)
  if (!checkRateLimit(`${ip}:${slug}`)) {
    return NextResponse.json({ error: '送信回数の上限に達しました。しばらくしてからお試しください' }, { status: 429 })
  }

  const form = await prisma.form.findUnique({ where: { slug } })
  if (!form || form.status !== 'published') {
    return NextResponse.json({ error: 'このフォームは公開されていません' }, { status: 404 })
  }

  const body = await req.json().catch(() => ({}))
  const { data, recaptchaToken } = body as { data?: Record<string, unknown>; recaptchaToken?: string }

  // reCAPTCHA 検証
  if (form.recaptchaEnabled) {
    const r = await verifyRecaptcha(recaptchaToken)
    if (!r.ok) {
      return NextResponse.json({ error: '送信検証に失敗しました（reCAPTCHA）' }, { status: 400 })
    }
  }

  // schema に基づき動的検証
  const schema = parseSchema(form.schema)
  const zodSchema = buildZodFromSchema(schema)
  const parsed = zodSchema.safeParse(data ?? {})
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  const submission = await prisma.formSubmission.create({
    data: {
      formId: form.id,
      data: JSON.stringify(parsed.data),
      ipAddress: ip,
      userAgent: req.headers.get('user-agent') ?? null,
    },
  })

  const formatted = formatAnswersForDisplay(schema, parsed.data as Record<string, unknown>)

  // メール通知（非同期・握り潰し）
  if (form.notifyEmails) {
    const recipients = form.notifyEmails.split(',').map(s => s.trim()).filter(Boolean)
    if (recipients.length > 0) {
      const baseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
      sendFormSubmissionNotification({
        to: recipients,
        formTitle: form.title,
        submissionId: submission.id,
        submittedAt: submission.createdAt,
        fields: formatted,
        reviewUrl: `${baseUrl}/admin/forms/${form.id}/submissions`,
      }).catch(err => console.error('[FormSubmit] notification mail error:', err?.message))
    }
  }

  // GAS Webhook（非同期・状態を更新）
  if (form.sheetWebhookUrl) {
    const fieldsObj: Record<string, string> = {}
    for (const f of formatted) fieldsObj[f.label] = f.value
    postToSheetWebhook({
      url: form.sheetWebhookUrl,
      payload: {
        id: submission.id,
        submittedAt: submission.createdAt.toISOString(),
        formTitle: form.title,
        fields: fieldsObj,
      },
    })
      .then(r => prisma.formSubmission.update({
        where: { id: submission.id },
        data: r.ok ? { sheetSyncedAt: new Date(), sheetSyncError: null } : { sheetSyncError: r.error ?? 'unknown error' },
      }))
      .catch(err => console.error('[FormSubmit] sheet webhook error:', err?.message))
  }

  return NextResponse.json({ ok: true, submissionId: submission.id }, { status: 201 })
}
