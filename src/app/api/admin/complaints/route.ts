import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { parseOccurredOn } from '@/lib/complaint'
import {
  requireComplaintAdmin, COMPLAINT_SELECT, complaintInputSchema,
  validateComplaintRelations, normalizeHandlerIds,
} from '@/lib/complaint-api'

/** GET: クレーム一覧（発生日の新しい順） */
export async function GET() {
  const user = await requireComplaintAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const complaints = await prisma.complaint.findMany({
    orderBy: [{ occurredOn: 'desc' }, { createdAt: 'desc' }],
    select: COMPLAINT_SELECT,
  })
  return NextResponse.json(complaints)
}

/** POST: クレームを新規登録 */
export async function POST(req: NextRequest) {
  const user = await requireComplaintAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const parsed = complaintInputSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const occurredOn = parseOccurredOn(parsed.data.occurredOn)
  if (!occurredOn) return NextResponse.json({ error: '発生日の形式が正しくありません' }, { status: 400 })

  // 新規作成では未指定の対応者を null で確定させる
  const input = normalizeHandlerIds({
    ...parsed.data,
    primaryHandlerId:   parsed.data.primaryHandlerId   ?? null,
    secondaryHandlerId: parsed.data.secondaryHandlerId ?? null,
    finalHandlerId:     parsed.data.finalHandlerId     ?? null,
  })

  const relationError = await validateComplaintRelations(input)
  if (relationError) return NextResponse.json({ error: relationError }, { status: 400 })

  const created = await prisma.complaint.create({
    data: { ...input, occurredOn },
    select: COMPLAINT_SELECT,
  })

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: `クレームを登録「${created.store.name}」`, req,
  })

  return NextResponse.json(created, { status: 201 })
}
