import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseSchema } from '@/lib/forms/types'
import { formatAnswersForDisplay } from '@/lib/forms/buildZodFromSchema'
import { postToSheetWebhook } from '@/lib/forms/sheetWebhook'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; subId: string }> }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(user?.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, subId } = await params

  const submission = await prisma.formSubmission.findFirst({
    where: { id: subId, formId: id },
    include: { form: true },
  })
  if (!submission) return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  if (!submission.form.sheetWebhookUrl) {
    return NextResponse.json({ error: 'Webhook URL が未設定です' }, { status: 400 })
  }

  const schema = parseSchema(submission.form.schema)
  let data: Record<string, unknown> = {}
  try { data = JSON.parse(submission.data) } catch { /* ignore */ }
  const formatted = formatAnswersForDisplay(schema, data)
  const fieldsObj: Record<string, string> = {}
  for (const f of formatted) fieldsObj[f.label] = f.value

  const result = await postToSheetWebhook({
    url: submission.form.sheetWebhookUrl,
    payload: {
      id: submission.id,
      submittedAt: submission.createdAt.toISOString(),
      formTitle: submission.form.title,
      fields: fieldsObj,
    },
  })

  await prisma.formSubmission.update({
    where: { id: submission.id },
    data: result.ok
      ? { sheetSyncedAt: new Date(), sheetSyncError: null }
      : { sheetSyncError: result.error ?? 'unknown error' },
  })

  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
