import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import StoreShell from '@/components/store/StoreShell'
import { buildStoreBootstrap, type StoreScopeBootstrap, type StoreMasters } from '@/lib/store-bootstrap'

/**
 * 店舗ポータルの共通レイアウト（サーバーコンポーネント）。
 *
 * セッションに加えて**表示スコープ（運営者配下の店舗・対応サービス・サイドメニュー）も
 * サーバーで解決**して渡す。こうするとクライアントからの
 * `/api/auth/session` と `/api/store/organization` の2往復（実測 各0.3秒前後）が消える。
 *
 * とくに organization は、ほぼ全ての一覧ページが `scope.loading` をゲートにしていたため、
 * 初回表示が「HTML/JS → organization → 主データ」の2段直列になっていた。
 * DBクエリは関数と同一リージョン（us-east-1）で数十msなので、
 * クライアント1往復と引き換えれば明確に得。レイアウトはクライアント遷移で
 * 再実行されないため、コストはハードロード時のみ。
 *
 * 認証そのものは middleware（ページ）と各APIの getServerSession が担保する。
 */
export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; role?: string; memberId?: string | null } | undefined

  // 店舗ロール以外（ログイン前・顧客・管理者）ではクエリを一切走らせない
  let scope: StoreScopeBootstrap | null = null
  let masters: StoreMasters | null = null
  if (user?.role === 'store' && user.id) {
    try {
      const boot = await buildStoreBootstrap(user.id, user.memberId ?? null)
      scope = boot.scope
      masters = boot.masters
    } catch {
      // 失敗しても画面は出す（Provider が従来どおりクライアントで取得しにいく）
      scope = null
      masters = null
    }
  }

  return <StoreShell session={session} scope={scope} masters={masters}>{children}</StoreShell>
}
