// 職業の選択肢（売買契約書作成フロー）。保存値は文字列のまま（User.occupation）。
// 「その他」を選んだときは自由入力した文字列をそのまま保存する。

export const OCCUPATION_OPTIONS = ['会社員', '自営業', '主婦', '無職', '学生'] as const
export const OCCUPATION_OTHER = 'その他'

/** 保存値から、セレクトの選択状態と自由入力欄の値を復元する */
export function splitOccupation(value: string | null | undefined): { select: string; other: string } {
  const v = (value ?? '').trim()
  if (!v) return { select: '', other: '' }
  if ((OCCUPATION_OPTIONS as readonly string[]).includes(v)) return { select: v, other: '' }
  // 「その他」だけ保存されていた場合や、プリセット以外の自由記入（旧データ含む）は「その他」扱い
  return { select: OCCUPATION_OTHER, other: v === OCCUPATION_OTHER ? '' : v }
}

/** セレクトの選択状態と自由入力欄の値から、保存する文字列を決める（未選択は空文字） */
export function joinOccupation(select: string, other: string): string {
  if (!select) return ''
  if (select === OCCUPATION_OTHER) return other.trim()
  return select
}
