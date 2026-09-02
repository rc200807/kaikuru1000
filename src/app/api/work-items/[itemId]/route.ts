import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recomputeDealAmounts } from '@/lib/deal-amounts'
import { isItemParentContracted, DEAL_LOCKED_MESSAGE } from '@/lib/deal-lock'
import { resolveWorkItemMaster, composeWorkItemNotes } from '@/lib/work-item-master'

async function verifyAccess(itemId: string, sessionUser: any) {
  const item = await prisma.workItem.findUnique({
    where: { id: itemId },
    include: { visitSchedule: { select: { storeId: true } }, deal: { select: { storeId: true } } },
  })
  if (!item) return { error: '作業品目が見つかりません', status: 404 }
  if (sessionUser.role === 'store') {
    const ownStore = item.deal?.storeId === sessionUser.id || item.visitSchedule?.storeId === sessionUser.id
    if (!ownStore) return { error: 'Forbidden', status: 403 }
  }
  return { item }
}

/** 作業品目を更新 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { itemId } = await params
  const access = await verifyAccess(itemId, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  // 売買契約書の発行後は取引内容を凍結する
  if (await isItemParentContracted(access.item!)) {
    return NextResponse.json({ error: DEAL_LOCKED_MESSAGE }, { status: 409 })
  }

  const body = await request.json()
  const updateData: any = {}

  // 作業名を変える場合も請求項目マスタから選ばせる（数量・単価だけの更新はそのまま通す）
  // チェック項目・追加人員・備考は作業名とセットで解決し、備考の表示テキストを組み立て直す。
  const touchesMaster = body.masterId !== undefined || body.workName !== undefined
  let resolvedOptions: { optionId: string; label: string; sortOrder: number }[] | null = null
  if (touchesMaster) {
    const resolved = await resolveWorkItemMaster({
      masterId: body.masterId,
      workName: body.workName,
      optionIds: body.optionIds,
      extraStaffCount: body.extraStaffCount,
      notes: body.notes !== undefined ? body.notes : access.item!.notesInput,
    })
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: 400 })
    const v = resolved.value
    updateData.masterId = v.masterId
    updateData.workName = v.workName
    updateData.notes = v.notes
    updateData.notesInput = v.notesInput
    updateData.extraStaffCount = v.extraStaffCount
    resolvedOptions = v.options
  } else if (body.notes !== undefined) {
    // 備考だけの更新：既存のチェック項目・追加人員を保ったまま表示テキストを作り直す
    const current = await prisma.workItemOptionSelection.findMany({
      where: { workItemId: itemId },
      orderBy: { sortOrder: 'asc' },
    })
    const notesInput = typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null
    updateData.notesInput = notesInput
    updateData.notes = composeWorkItemNotes({
      optionLabels: current.map(c => c.label),
      extraStaffCount: access.item!.extraStaffCount,
      notesInput,
    })
  }
  if (body.unitPrice !== undefined) updateData.unitPrice = body.unitPrice
  if (body.quantity !== undefined) updateData.quantity = body.quantity

  const updated = await prisma.$transaction(async (tx) => {
    if (resolvedOptions) {
      // チェック結果は毎回入れ替える（差分計算より単純で、順序もマスタ順に揃う）
      await tx.workItemOptionSelection.deleteMany({ where: { workItemId: itemId } })
      if (resolvedOptions.length > 0) {
        await tx.workItemOptionSelection.createMany({
          data: resolvedOptions.map(o => ({ workItemId: itemId, optionId: o.optionId, label: o.label, sortOrder: o.sortOrder })),
        })
      }
    }

    const result = await tx.workItem.update({
      where: { id: itemId },
      data: updateData,
    })

    // 案件合計を再計算（正）。訪問合計も後方互換で維持。
    if (result.dealId) await recomputeDealAmounts(tx, result.dealId)
    if (result.visitScheduleId) {
      const allItems = await tx.workItem.findMany({ where: { visitScheduleId: result.visitScheduleId } })
      const total = allItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
      await tx.visitSchedule.update({ where: { id: result.visitScheduleId }, data: { billingAmount: total } })
    }

    return result
  })

  return NextResponse.json(updated)
}

/** 作業品目を削除 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { itemId } = await params
  const access = await verifyAccess(itemId, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  // 売買契約書の発行後は取引内容を凍結する
  if (await isItemParentContracted(access.item!)) {
    return NextResponse.json({ error: DEAL_LOCKED_MESSAGE }, { status: 409 })
  }

  const visitScheduleId = access.item!.visitScheduleId
  const dealId = access.item!.dealId

  await prisma.$transaction(async (tx) => {
    await tx.workItem.delete({ where: { id: itemId } })

    // 案件合計を再計算（正）。訪問合計も後方互換で維持。
    if (dealId) await recomputeDealAmounts(tx, dealId)
    if (visitScheduleId) {
      const allItems = await tx.workItem.findMany({ where: { visitScheduleId } })
      const total = allItems.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0)
      await tx.visitSchedule.update({ where: { id: visitScheduleId }, data: { billingAmount: total } })
    }
  })

  return NextResponse.json({ deleted: true })
}
