/**
 * 案件の作成者表示の中央定義。
 *
 * お問い合わせフォーム（Webフォーム）から自動作成された案件は、作成者が
 * 「お客様の氏名」になっていて店舗が誰の操作か判断できなかったため、
 * 種別 'webform' として扱い「Webフォーム」と表示する。
 *
 * 注意: 'use client' を付けないこと（サーバー・クライアント共用）
 */

/** Webフォーム（お問い合わせフォーム）由来の案件の作成者種別 */
export const WEBFORM_CREATED_BY_TYPE = 'webform'
/** 作成者名のスナップショットにも同じ表記を入れる（CSV・シート出力でもそのまま出る） */
export const WEBFORM_CREATED_BY_NAME = 'Webフォーム'

export const CREATOR_TYPE_LABEL: Record<string, string> = {
  store: '店舗',
  admin: '管理者',
  superadmin: '管理者',
  hr: '管理者',
  sysadmin: 'システム',
  customer: 'お客様',
  partner: 'パートナー',
  linkpartner: '連携パートナー',
  [WEBFORM_CREATED_BY_TYPE]: 'Webフォーム',
}

/**
 * 案件の作成者の表示文字列。
 * Webフォーム由来は種別だけを出す（「Webフォーム（Webフォーム）」にならないように）。
 * 過去データ（createdByType='customer' かつ問い合わせ由来）も Webフォーム として扱えるよう、
 * fromInquiry を渡せるようにしている。
 */
export function dealCreatorLabel(deal: {
  createdByName: string | null
  createdByType: string | null
  /** 問い合わせ（Webフォーム）由来か */
  fromInquiry?: boolean
}): string {
  const isWebform = deal.createdByType === WEBFORM_CREATED_BY_TYPE
    || (!!deal.fromInquiry && (deal.createdByType === 'customer' || !deal.createdByType))
  if (isWebform) return CREATOR_TYPE_LABEL[WEBFORM_CREATED_BY_TYPE]

  if (!deal.createdByName && !deal.createdByType) return '—'
  const typeLabel = deal.createdByType ? (CREATOR_TYPE_LABEL[deal.createdByType] ?? deal.createdByType) : null
  return deal.createdByName ? `${deal.createdByName}${typeLabel ? `（${typeLabel}）` : ''}` : (typeLabel ?? '—')
}
