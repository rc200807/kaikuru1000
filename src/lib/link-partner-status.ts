import { prisma } from '@/lib/prisma'
import { recordLinkPartnerActivity } from '@/lib/link-partner-activity'

export type StatusTargetType = 'inquiry' | 'customer'

export function isStatusTargetType(v: unknown): v is StatusTargetType {
  return v === 'inquiry' || v === 'customer'
}

// パートナーの対応ステータス定義（有効なもの・並び順）
export async function listLinkPartnerStatuses(linkPartnerId: string, targetType: StatusTargetType) {
  return prisma.linkPartnerStatus.findMany({
    where: { linkPartnerId, targetType, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, label: true, color: true, sortOrder: true },
  })
}

export type RecordStatusInfo = {
  statusId: string | null
  label: string | null
  color: string | null
  updatedByName: string | null
  updatedAt: string | null
}

// 対象ID群の現在ステータスを一括取得（N+1回避）。key=targetId
export async function getRecordStatusMap(
  linkPartnerId: string,
  targetType: StatusTargetType,
  targetIds: string[]
): Promise<Record<string, RecordStatusInfo>> {
  if (targetIds.length === 0) return {}
  const rows = await prisma.linkPartnerRecordStatus.findMany({
    where: { linkPartnerId, targetType, targetId: { in: targetIds } },
    select: {
      targetId: true,
      statusId: true,
      updatedByName: true,
      updatedAt: true,
      status: { select: { label: true, color: true } }, // isActive でも履歴としてラベルは表示
    },
  })
  const map: Record<string, RecordStatusInfo> = {}
  for (const r of rows) {
    map[r.targetId] = {
      statusId: r.statusId,
      label: r.status?.label ?? null,
      color: r.status?.color ?? null,
      updatedByName: r.updatedByName,
      updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
    }
  }
  return map
}

// レコードにステータスを設定（upsert）し、変更履歴を set_status ログに記録する。
// statusId=null は「未設定」に戻す。指定時は同パートナー・同targetTypeの実在ステータスのみ許可。
export async function setRecordStatus(opts: {
  linkPartnerId: string
  targetType: StatusTargetType
  targetId: string
  statusId: string | null
  member: { id: string; name: string | null }
  targetLabel: string // ログ用の対象表示名（フォーム名・顧客名など）
  req?: unknown
}): Promise<{ ok: true; label: string | null } | { ok: false; error: string }> {
  const { linkPartnerId, targetType, targetId, statusId, member, targetLabel, req } = opts

  let newLabel: string | null = null
  if (statusId) {
    const st = await prisma.linkPartnerStatus.findFirst({
      where: { id: statusId, linkPartnerId, targetType, isActive: true },
      select: { label: true },
    })
    if (!st) return { ok: false, error: '指定された対応ステータスは利用できません' }
    newLabel = st.label
  }

  const existing = await prisma.linkPartnerRecordStatus.findUnique({
    where: { linkPartnerId_targetType_targetId: { linkPartnerId, targetType, targetId } },
    select: { status: { select: { label: true } } },
  })
  const oldLabel = existing?.status?.label ?? null

  await prisma.linkPartnerRecordStatus.upsert({
    where: { linkPartnerId_targetType_targetId: { linkPartnerId, targetType, targetId } },
    create: { linkPartnerId, targetType, targetId, statusId, updatedByMemberId: member.id, updatedByName: member.name },
    update: { statusId, updatedByMemberId: member.id, updatedByName: member.name },
  })

  const typeLabel = targetType === 'inquiry' ? '問い合わせ' : '顧客'
  const detail = `${typeLabel}「${targetLabel}」: ${oldLabel ?? '未設定'} → ${newLabel ?? '未設定'}`
  await recordLinkPartnerActivity({
    linkPartnerId,
    memberId: member.id,
    memberName: member.name,
    action: 'set_status',
    targetType,
    targetId,
    detail,
    req,
  })

  return { ok: true, label: newLabel }
}
