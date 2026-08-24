import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import StoreShell from '@/components/store/StoreShell'

/**
 * 店舗ポータルの共通レイアウト（サーバーコンポーネント）。
 * セッションをサーバーで解決して SessionProvider に渡すことで、
 * クライアントからの /api/auth/session 往復（実測 0.3 秒前後）を1回ぶん削っている。
 * 認証そのものは middleware（ページ）と各APIの getServerSession が担保する。
 */
export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  return <StoreShell session={session}>{children}</StoreShell>
}
