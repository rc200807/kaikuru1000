import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireLinkPartner } from '@/lib/link-partner-auth'
import { resolveAssignedFormIds } from '@/lib/link-partner-query'
import { setRecordStatus } from '@/lib/link-partner-status'

const schema = z.object({ statusId: z.string().nullable() })

// 問い合わせの対応ステータスを設定（全メンバー可）。割当フォームのものに限定。
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireLinkPartner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'statusId が不正です' }, { status: 400 })

  const formIds = await resolveAssignedFormIds(user.linkPartnerId)
  if (formIds.length === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // スコープ検証：割当フォームの問い合わせのみ
  const submission = await prisma.formSubmission.findFirst({
    where: { id, formId: { in: formIds } },
    select: { id: true, form: { select: { title: true } } },
  })
  if (!submission) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const result = await setRecordStatus({
    linkPartnerId: user.linkPartnerId,
    targetType: 'inquiry',
    targetId: id,
    statusId: parsed.data.statusId,
    member: { id: user.id, name: user.name },
    targetLabel: submission.form.title,
    req,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, statusId: parsed.data.statusId, label: result.label })
}
