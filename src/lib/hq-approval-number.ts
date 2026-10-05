// 案件の「本部承認番号」。管理ポータルからのみ登録でき、店舗は閲覧のみ。
// 中身は数字と記号だけの文字列（例: 2026-0815/03）。英字・空白は受け付けない。

export const HQ_APPROVAL_NUMBER_MAX = 50

/** 半角の数字と ASCII 記号のみ（英字・空白を除く） */
const PATTERN = /^[0-9!-/:-@[-`{-~]+$/

export type HqApprovalNumberResult =
  | { ok: true; value: string | null }
  | { ok: false; error: string }

/**
 * 入力を正規化して検証する。全角の数字・記号（例: １２３－４）は半角に揃え、前後の空白は落とす。
 * 空文字/null は「未登録に戻す」として value: null を返す。
 */
export function normalizeHqApprovalNumber(input: unknown): HqApprovalNumberResult {
  if (input === null || input === undefined) return { ok: true, value: null }
  if (typeof input !== 'string') return { ok: false, error: '本部承認番号が不正です' }
  // NFKC で全角英数記号を半角へ。長音・ダッシュ類はハイフンに寄せる（「ー」「−」「―」で入力されがち）
  const value = input.normalize('NFKC').replace(/[ー−―‐–—]/g, '-').trim()
  if (!value) return { ok: true, value: null }
  if (value.length > HQ_APPROVAL_NUMBER_MAX) {
    return { ok: false, error: `本部承認番号は${HQ_APPROVAL_NUMBER_MAX}文字以内で入力してください` }
  }
  if (!PATTERN.test(value)) {
    return { ok: false, error: '本部承認番号は数字と記号で入力してください（英字・空白は使えません）' }
  }
  return { ok: true, value }
}
