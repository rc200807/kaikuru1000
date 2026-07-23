import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

/**
 * 連携パートナーに開示してよい顧客(User)フィールドの許可リスト（唯一の情報源）。
 * ここに無いフィールドは絶対に返さない：案件/買取・売却金額(deals)、身分証(idDocument, idName, idAddress, OCR系)、
 * セルフィー/顔照合、住所証明、職業、口座(bankName/branchName/accountType/accountNumber/accountHolder)、
 * 内部メモ(internalNote)、パスワード、および deals/purchaseMemos/visitSchedules/deliveryShipments/visitRequests の各relation。
 * `satisfies Prisma.UserSelect` により、存在しないフィールド（例: postalCode は Store 側の列）を書くとコンパイルエラーになる。
 */
export const LINKPARTNER_SAFE_USER_SELECT = {
  id: true,
  name: true,
  furigana: true,
  lastName: true,
  firstName: true,
  lastNameKana: true,
  firstNameKana: true,
  email: true,
  phone: true,
  phone2: true,
  phone3: true,
  address: true,
  customerType: true,
  customerTypes: true,
  leadSource: true,
  createdAt: true,
} satisfies Prisma.UserSelect

/**
 * 連携パートナーに開示してよいフォーム回答(FormSubmission)フィールドの許可リスト。
 * ipAddress / userAgent / externalApi* / sheet* は除外。顧客は id/name の最小リンクのみ。
 */
export const LINKPARTNER_SAFE_SUBMISSION_SELECT = {
  id: true,
  formId: true,
  data: true,
  createdAt: true,
  form: { select: { id: true, title: true, slug: true, schema: true } },
  user: { select: { id: true, name: true } },
} satisfies Prisma.FormSubmissionSelect

/**
 * この連携パートナーに割り当てられているフォームIDを解決する。
 * 必ずサーバー側でセッションの linkPartnerId から解決する（クライアント入力を信用しない）。
 * 割当が空なら空配列を返し、呼び出し側は「データなし」として即座に空を返すこと。
 */
export async function resolveAssignedFormIds(linkPartnerId: string): Promise<string[]> {
  const rows = await prisma.linkPartnerForm.findMany({
    where: { linkPartnerId },
    select: { formId: true },
  })
  return rows.map((r) => r.formId)
}

/**
 * 連携パートナーが閲覧してよい顧客(User)の where 条件（一覧/件数/詳細で共通利用しドリフトを防ぐ）。
 * 割当フォームに1件以上回答がある、有効かつ未統合の顧客のみ。
 */
export function linkPartnerCustomerWhere(formIds: string[]) {
  return {
    isActive: true,
    mergedIntoUserId: null,
    formSubmissions: { some: { formId: { in: formIds } } },
  } satisfies Prisma.UserWhereInput
}
