import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

type Client = Prisma.TransactionClient | typeof prisma

// 顧客統合で「残す顧客(survivor)」に統一できるスカラー項目のホワイトリスト
export const MERGE_SCALAR_FIELDS = [
  'name', 'furigana', 'email', 'phone', 'phone2', 'phone3', 'address', 'birthDate',
  'occupation', 'leadSource', 'bankName', 'branchName', 'accountType', 'accountNumber', 'accountHolder',
  'customerType',
] as const
export type MergeScalarField = typeof MERGE_SCALAR_FIELDS[number]

/**
 * 顧客(mergedId)を顧客(survivorId)に統合する。tx 内で呼ぶこと。
 * - 案件・訪問記録などの関連レコードは全て survivor に付け替え（両方のデータを残す）
 * - scalars で指定された項目は survivor に上書き（名前・メール等の統一）
 * - merged は論理削除（無効化＋統合先を記録、メールの一意制約は解放）
 */
export async function mergeCustomers(
  tx: Client,
  survivorId: string,
  mergedId: string,
  scalars: Partial<Record<MergeScalarField, unknown>>,
) {
  // 1) 関連レコードを survivor へ付け替え（userId を差し替え）
  await tx.visitSchedule.updateMany({ where: { userId: mergedId }, data: { userId: survivorId } })
  await tx.deal.updateMany({ where: { userId: mergedId }, data: { userId: survivorId } })
  await tx.purchaseMemo.updateMany({ where: { userId: mergedId }, data: { userId: survivorId } })
  await tx.deliveryShipment.updateMany({ where: { userId: mergedId }, data: { userId: survivorId } })
  await tx.magicLink.updateMany({ where: { userId: mergedId }, data: { userId: survivorId } })
  await tx.inquiry.updateMany({ where: { userId: mergedId }, data: { userId: survivorId } })
  await tx.visitRequest.updateMany({ where: { userId: mergedId }, data: { userId: survivorId } })
  await tx.lineUser.updateMany({ where: { userId: mergedId }, data: { userId: survivorId } })
  await tx.formSubmission.updateMany({ where: { userId: mergedId }, data: { userId: survivorId } })

  // 2) パートナーメモは @@unique([salesPartnerId, userId]) のため、同一パートナーの重複は本文を統合
  const mergedNotes = await tx.salesPartnerCustomerNote.findMany({ where: { userId: mergedId } })
  if (mergedNotes.length > 0) {
    const survivorNotes = await tx.salesPartnerCustomerNote.findMany({ where: { userId: survivorId } })
    const byPartner = new Map(survivorNotes.map(n => [n.salesPartnerId, n]))
    for (const note of mergedNotes) {
      const existing = byPartner.get(note.salesPartnerId)
      if (existing) {
        const combined = [existing.note, note.note].filter(Boolean).join('\n---\n')
        await tx.salesPartnerCustomerNote.update({ where: { id: existing.id }, data: { note: combined || null } })
        await tx.salesPartnerCustomerNote.delete({ where: { id: note.id } })
      } else {
        await tx.salesPartnerCustomerNote.update({ where: { id: note.id }, data: { userId: survivorId } })
      }
    }
  }

  // 3) merged の一意項目(email)を解放しつつ論理削除としてマーク
  await tx.user.update({
    where: { id: mergedId },
    data: { email: null, isActive: false, mergedIntoUserId: survivorId, mergedAt: new Date() },
  })

  // 4) 選択されたスカラー項目を survivor に統一（email はこの時点で merged 側が解放済み）
  const data: Record<string, unknown> = {}
  for (const key of MERGE_SCALAR_FIELDS) {
    if (scalars[key] !== undefined) data[key] = scalars[key]
  }
  if (Object.keys(data).length > 0) {
    await tx.user.update({ where: { id: survivorId }, data })
  }
}
