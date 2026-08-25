import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import AdminShell from '@/components/admin/AdminShell'

/**
 * 管理ポータルの共通レイアウト（サーバーコンポーネント）。
 * セッションをサーバーで解決して SessionProvider に渡し、
 * クライアントからの /api/auth/session 往復（実測0.3秒前後）を1回ぶん削る。
 * 認証そのものは middleware（ページ）と各APIの getServerSession が担保する。
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  return <AdminShell session={session}>{children}</AdminShell>
}
