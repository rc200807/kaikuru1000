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

/**
 * 画像一覧編集（買取品目・宅配送付・買取相談メモなど）で使う共通の保存前処理。
 *
 * 「Blob URLをクライアントに露出しない」ため、一覧取得APIは実URLの代わりに
 * `${proxyPrefix}/{index}` という認証プロキシURLを返している。編集フォームは既存画像を
 * このプロキシURLのまま表示・保持し、新規アップロード分だけ実URLが混ざった配列を
 * 保存APIに送り返す作りになっている。
 *
 * ここで各要素がプロキシURL（自分自身の `${proxyPrefix}/数字`）ならDB上の現在の実URLに
 * 解決し、そうでなければ「新規アップロードされた実URL」としてそのまま使う。
 * これをせずクライアントの配列をそのまま保存すると、一度も画像を変更していない編集保存でも
 * プロキシURL文字列そのものがDBに書き込まれてしまい、次にプロキシへアクセスすると
 * 自分自身にリダイレクトし続けて画像が壊れる（実際に発生した不具合）。
 */
export function resolveEditedImageUrls(
  currentUrls: string[],
  incoming: unknown,
  proxyPrefix: string,
): string[] {
  if (!Array.isArray(incoming)) return currentUrls
  const proxyRe = new RegExp(`^${proxyPrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(\\d+)$`)
  const resolved: string[] = []
  for (const item of incoming) {
    if (typeof item !== 'string' || !item) continue
    const m = item.match(proxyRe)
    if (m) {
      const original = currentUrls[Number(m[1])]
      if (original) resolved.push(original)
      continue
    }
    resolved.push(item)
  }
  return resolved
}
