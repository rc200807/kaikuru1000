/**
 * お客様用マジックリンク（/magic/[token]）の利用可否判定。
 *
 * 見積書・売買契約書など「書類に紐づくリンク」（contractId あり）は、有効期限内なら何度でも開ける。
 * 店頭でQRを読み取ったあと、読み取りアプリのプレビュー→ブラウザで開き直す／もう一度読み取る／
 * 家族のスマホで読む、といった2回目以降のアクセスで「使用済み」にならないようにするため。
 * 書類に紐づかない汎用ログインリンクは従来どおり1回限り。
 */
export type MagicLinkState = {
  contractId: string | null
  usedAt: Date | null
  expiresAt: Date
}

export type MagicLinkCheck = { ok: true } | { ok: false; reason: 'expired' | 'used' }

export function checkMagicLink(link: MagicLinkState, now: Date = new Date()): MagicLinkCheck {
  if (link.expiresAt < now) return { ok: false, reason: 'expired' }
  if (link.usedAt && !link.contractId) return { ok: false, reason: 'used' }
  return { ok: true }
}
