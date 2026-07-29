/**
 * 領収書の発行者情報（RC inc.）。
 * 正式な住所・インボイス登録番号はユーザー確認後にここだけ差し替える。
 */
export const RECEIPT_ISSUER = {
  name: 'RC株式会社',
  nameEn: 'RC inc.',
  address: '', // 例: 東京都◯◯区◯◯ 1-2-3（未設定なら領収書に行を出さない）
  tel: '',
  email: '',
  /** 適格請求書発行事業者登録番号（T+13桁）。未設定なら領収書に行を出さない */
  invoiceRegistrationNumber: '',
} as const
