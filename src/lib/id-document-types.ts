/**
 * 身分証明証（本人確認書類）の種別の中央定義。
 *
 * 古物営業法に基づく本人確認では「現住所が記載された公的書類」が必要になるため、
 * 住所欄のない旅券は対象外とし、選択肢の表記でその条件を明示している。
 * 顧客ポータル（登録・マイページ）で同じ選択肢を出すため、ここを唯一の定義とする。
 *
 * 注意: 'use client' を付けないこと（サーバー・クライアント共用）
 */

export type IdDocumentType = {
  /** DB（User.idDocumentType）に保存する値 */
  value: string
  /** 選択肢の表示ラベル */
  label: string
  /** カード選択UI用の絵文字 */
  icon: string
}

export const ID_DOCUMENT_TYPES: IdDocumentType[] = [
  { value: '運転免許証', label: '運転免許証（裏面も必要）', icon: '🪪' },
  { value: 'マイナンバーカード', label: 'マイナンバーカード（表面のみ）', icon: '💳' },
  { value: '住所記載の日本国のパスポート', label: '住所記載の日本国のパスポート', icon: '📕' },
  { value: '在留カード', label: '在留カード', icon: '🌏' },
]

/** 裏面の画像も必要な書類 */
export const ID_DOC_TYPES_REQUIRING_BACK = ['運転免許証']

export function idDocTypeNeedsBack(docType: string | null | undefined): boolean {
  return !!docType && ID_DOC_TYPES_REQUIRING_BACK.includes(docType)
}
