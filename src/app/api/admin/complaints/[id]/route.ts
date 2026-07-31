import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { parseOccurredOn } from '@/lib/complaint'
import {
  requireComplaintAdmin, COMPLAINT_SELECT, complaintInputSchema,
  validateComplaintRelations, normalizeHandlerIds,
} from '@/lib/complaint-api'

/** PATCH: クレームを更新（部分更新。送られた項目のみ変更） */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireComplaintAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const current = await prisma.complaint.findUnique({
    where: { id },
    select: { storeId: true, primaryHandlerId: true, secondaryHandlerId: true, finalHandlerId: true },
  })
  if (!current) return NextResponse.json({ error: 'クレームが見つかりません' }, { status: 404 })

  const parsed = complaintInputSchema.partial().safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  const { occurredOn: occurredOnRaw, ...rest } = parsed.data
  // 送られてきたキーのみを更新対象にする（未送信の対応者を消さない）
  const data: Record<string, unknown> = normalizeHandlerIds({ ...rest })

  if (occurredOnRaw !== undefined) {
    const occurredOn = parseOccurredOn(occurredOnRaw)
    if (!occurredOn) return NextResponse.json({ error: '発生日の形式が正しくありません' }, { status: 400 })
    data.occurredOn = occurredOn
  }

  // 関連の検証は、変更後の値（未指定なら現在値）で行う
  const touchesRelations = 'storeId' in data
    || 'primaryHandlerId' in data || 'secondaryHandlerId' in data || 'finalHandlerId' in data
  if (touchesRelations) {
    const relationError = await validateComplaintRelations({
      storeId:            (data.storeId as string) ?? current.storeId,
      primaryHandlerId:   'primaryHandlerId'   in data ? (data.primaryHandlerId   as string | null) : current.primaryHandlerId,
      secondaryHandlerId: 'secondaryHandlerId' in data ? (data.secondaryHandlerId as string | null) : current.secondaryHandlerId,
      finalHandlerId:     'finalHandlerId'     in data ? (data.finalHandlerId     as string | null) : current.finalHandlerId,
    })
    if (relationError) return NextResponse.json({ error: relationError }, { status: 400 })
  }

  const updated = await prisma.complaint.update({ where: { id }, data, select: COMPLAINT_SELECT })

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: `クレームを編集「${updated.store.name}」`, req,
  })

  return NextResponse.json(updated)
}

/** DELETE: クレームを削除 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireComplaintAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const existing = await prisma.complaint.findUnique({
    where: { id },
    select: { id: true, store: { select: { name: true } } },
  })
  if (!existing) return NextResponse.json({ error: 'クレームが見つかりません' }, { status: 404 })

  await prisma.complaint.delete({ where: { id } })

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: `クレームを削除「${existing.store.name}」`, req,
  })

  return NextResponse.json({ deleted: true })
}
