import { NextResponse } from 'next/server'

/**
 * ほとんど変化しないマスタ系データ用の短期キャッシュヘッダー。
 *
 * 流入経路・買取カテゴリー・訪問ステータス・営業時間などは管理側でたまに変える程度なのに、
 * 画面を開くたびに毎回取得していた（日本→米国リージョンの往復で1本0.3秒前後）。
 * private（ユーザー単位・共有キャッシュには載せない）で60秒だけブラウザにキャッシュさせ、
 * その後10分間は stale-while-revalidate でバックグラウンド更新に任せる。
 *
 * 変更直後に最大60秒だけ古い値が見える可能性があるが、これらは選択肢の並び程度なので許容する。
 * 逆に、金額・件数・ステータスなど「今の値」が要るものには使わない。
 */
export const MASTER_CACHE_CONTROL = 'private, max-age=60, stale-while-revalidate=600'

/** マスタ系GETのレスポンスにキャッシュヘッダーを付けて返す */
export function masterJson(body: unknown, init?: ResponseInit) {
  const res = NextResponse.json(body as Record<string, unknown>, init)
  res.headers.set('Cache-Control', MASTER_CACHE_CONTROL)
  return res
}
