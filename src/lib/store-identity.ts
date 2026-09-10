/**
 * 店舗の見分け（色・頭文字）の中央定義。
 *
 * 運営者配下の複数店舗を同時表示すると、どの行がどの店舗のものか分からなくなる。
 * 全画面で「同じ店舗＝同じ色・同じ頭文字」にするため、決め方をここ1箇所に集約する。
 *
 * 注意: 'use client' を付けないこと（サーバー・クライアント共用の純ロジック）
 */

/**
 * 店舗識別色。店舗ポータルは固定ライトテーマ（globals.css の [data-portal="store"]）なので
 * 白〜薄グレー背景に載る前提で選んでいる。
 * ブランド赤（--store-primary #b91c1c）は「操作できるもの」の色なので店舗色には使わない。
 */
export const STORE_COLORS = [
  '#2563eb', // blue
  '#059669', // emerald
  '#d97706', // amber
  '#7c3aed', // violet
  '#db2777', // pink
  '#0891b2', // cyan
  '#65a30d', // lime
  '#ea580c', // orange
  '#4f46e5', // indigo
  '#0f766e', // teal
] as const

/**
 * 並び順（＝店舗の登録順）から色を引く。
 * getOperatorStores が createdAt asc で返す安定した順序を使うこと。
 * 選択順（selectedIds）は操作のたびに変わるので使ってはいけない。
 */
export function storeColorAt(index: number): string {
  if (!Number.isInteger(index) || index < 0) return STORE_COLORS[0]
  return STORE_COLORS[index % STORE_COLORS.length]
}

/** 一覧に無い店舗（店舗名しか返さないAPIなど）のフォールバック。同じ文字列なら必ず同じ色になる */
export function storeColorFromKey(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0
  return STORE_COLORS[Math.abs(h) % STORE_COLORS.length]
}

const CORP_AFFIXES = ['株式会社', '有限会社', '合同会社', '合資会社', '合名会社']

/** 法人格の表記を落とす（前株・後株どちらも） */
function stripCorpAffix(name: string): string {
  const s = (name ?? '').trim()
  for (const affix of CORP_AFFIXES) {
    if (s.startsWith(affix)) return s.slice(affix.length).trim()
    if (s.endsWith(affix)) return s.slice(0, -affix.length).trim()
  }
  return s
}

/** サロゲートペア（絵文字など）で壊れないよう、書記素ではなくコードポイント単位で先頭を取る */
function firstChar(s: string): string {
  return Array.from(s)[0] ?? ''
}

/**
 * 店舗名リストの共通接頭辞。
 *
 * 「買いクル東京店」「買いクル大阪店」のようにブランド名が頭に付く命名だと、
 * 素の先頭1文字はどの店舗も「買」になって頭文字が識別に使えない。
 * 全店舗に共通する接頭辞を求めて取り除く。
 * 取り除くと空になる店舗が1つでもあれば、接頭辞なし（従来どおり先頭1文字）に倒す。
 */
export function commonStoreNamePrefix(names: readonly string[]): string {
  const cleaned = names.map(stripCorpAffix).filter(n => n.length > 0)
  if (cleaned.length < 2) return ''

  let prefix = cleaned[0]
  for (const name of cleaned.slice(1)) {
    let i = 0
    while (i < prefix.length && i < name.length && prefix[i] === name[i]) i++
    prefix = prefix.slice(0, i)
    if (!prefix) return ''
  }
  // 接頭辞を取ると残りが無くなる店舗があるなら、この接頭辞は使えない
  if (cleaned.some(n => n.length <= prefix.length)) return ''
  return prefix
}

/** 店舗名の頭文字（アバターの丸に出す1文字）。共通接頭辞は取り除く */
export function storeInitial(name: string | null | undefined, commonPrefix = ''): string {
  let s = stripCorpAffix(name ?? '')
  if (commonPrefix && s.startsWith(commonPrefix) && s.length > commonPrefix.length) {
    s = s.slice(commonPrefix.length).trim()
  }
  return firstChar(s) || '?'
}
