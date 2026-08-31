import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { normalizeStoreStatus } from '@/lib/store-status'

/**
 * 店舗ログイン画面の「店舗を選ぶ」プルダウン用の一覧。
 *
 * ログイン前に呼ぶので認証は掛けられない。返すのは店舗コードと店舗名だけに絞る
 * （メール・住所・電話などは返さない）。店舗名と店舗コードは問い合わせフォームや
 * LINE友だち追加ページ（/inquiry/[storeCode] 等）で既に公開しているものと同じ範囲。
 *
 * 認証必須の /api/store/* とは別系統にしてある（このパスだけが公開である、と分かるように）。
 */
export async function GET() {
  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: { code: true, name: true, storeStatus: true },
    orderBy: { code: 'asc' },
  })

  // 閉店・移管済の店舗はログインしないので選択肢から外す
  const selectable = stores
    .filter(s => !['closed', 'transferred'].includes(normalizeStoreStatus(s.storeStatus)))
    .map(s => ({ code: s.code, name: s.name }))

  return NextResponse.json(selectable, {
    // 店舗の増減は頻繁ではないので短時間キャッシュしてよい
    headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300' },
  })
}
