/**
 * 画像URLのヘルパー（クライアント・サーバー共用）。
 *
 * サムネイルは保存時に `<本体と同じ名前>_thumb.webp` で並べて置く規約にしている。
 * こうするとモデルごとにサムネ用カラムを増やさずに済み、既存データにも影響しない。
 * WebP 化する前に保存された画像（.jpg / .png）にはサムネが無いので、その場合は
 * 本体のURLをそのまま返す。
 */

/** 一覧・グリッド表示用のサムネURL。無ければ元のURLを返す */
export function thumbUrlFor(url: string | null | undefined): string {
  if (!url) return ''
  // クエリ付き（Blobの署名など）でも壊さないように、パス部分だけを見る
  const [path, query] = url.split('?')
  if (!path.endsWith('.webp')) return url
  if (path.endsWith('_thumb.webp')) return url
  const thumb = path.replace(/\.webp$/, '_thumb.webp')
  return query ? `${thumb}?${query}` : thumb
}

/** サムネURLから本体URLに戻す（拡大表示用） */
export function fullUrlFor(url: string | null | undefined): string {
  if (!url) return ''
  const [path, query] = url.split('?')
  if (!path.endsWith('_thumb.webp')) return url
  const full = path.replace(/_thumb\.webp$/, '.webp')
  return query ? `${full}?${query}` : full
}
