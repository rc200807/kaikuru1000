import type { Prisma, PrismaClient } from '@prisma/client'

/**
 * 運営者（Operator）→ 店舗（Store）へ継承される項目。
 * Store / Operator で同名のフィールドなので、そのまま updateMany の data に使える。
 * - 銀行口座情報（bankName / branchName / accountType / accountNumber / accountHolder）
 * - 古物許可番号（antiquePermitNumber）
 * - インボイス番号（invoiceNumber）
 *
 * 運営者を「正」とし、紐づく店舗には常にこれらの値を同期（上書き）する。
 */
export const OPERATOR_INHERITED_FIELDS = [
  'bankName', 'branchName', 'accountType', 'accountNumber', 'accountHolder',
  'antiquePermitNumber', 'invoiceNumber',
] as const
export type OperatorInheritedField = typeof OPERATOR_INHERITED_FIELDS[number]

type InheritedSource = Partial<Record<OperatorInheritedField, string | null>>

/** 継承項目だけを抜き出し、店舗更新用の値に整形（未設定は null に寄せる） */
export function operatorInheritedValues(
  op: InheritedSource,
): Record<OperatorInheritedField, string | null> {
  return {
    bankName: op.bankName ?? null,
    branchName: op.branchName ?? null,
    accountType: op.accountType ?? null,
    accountNumber: op.accountNumber ?? null,
    accountHolder: op.accountHolder ?? null,
    antiquePermitNumber: op.antiquePermitNumber ?? null,
    invoiceNumber: op.invoiceNumber ?? null,
  }
}

/** 通常クライアント・トランザクションクライアントどちらでも受け付ける */
type DbClient = PrismaClient | Prisma.TransactionClient

const INHERITED_SELECT = {
  bankName: true, branchName: true, accountType: true,
  accountNumber: true, accountHolder: true,
  antiquePermitNumber: true, invoiceNumber: true,
} as const

/**
 * 指定運営者に紐づく全店舗へ、運営者の継承項目を反映（上書き同期）する。
 * @returns 更新した店舗数
 */
export async function syncStoresForOperator(db: DbClient, operatorId: string): Promise<number> {
  const op = await db.operator.findUnique({ where: { id: operatorId }, select: INHERITED_SELECT })
  if (!op) return 0
  const res = await db.store.updateMany({
    where: { operatorId },
    data: operatorInheritedValues(op),
  })
  return res.count
}
