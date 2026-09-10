/**
 * 店舗ポータルの初期データをサーバー側でまとめて解決する。
 *
 * これまで `StoreScopeProvider` はマウント後に `/api/store/organization` を叩いており、
 * その `loading` を**ほぼ全ての一覧ページがゲートにしていた**ため、
 * 初回表示が必ず「HTML/JS → organization（0.3秒）→ 主データ（0.3秒）」の2段直列になっていた。
 *
 * 日本→iad1 は1往復 0.22〜0.45 秒かかる一方、関数↔DB（us-east-1）は 2〜5ms/クエリ。
 * HTML 自体すでに iad1 でレンダリングされている（`getServerSession` を使う＝dynamic）ので、
 * **クライアントの1往復をサーバーのDBクエリ数本に置き換えるのが最も効く**。
 *
 * `(store)/layout.tsx`（サーバーコンポーネント）から呼び、`StoreShell` 経由で
 * Provider の初期値として注ぎ込む。App Router のレイアウトはクライアント遷移では
 * 再実行されないので、コストはハードロード時のみ。
 */
import { prisma } from '@/lib/prisma'
import { getOperatorStores, isOrgAdmin } from '@/lib/store-scope'
import { parseStoreServices } from '@/lib/store-services'
import { resolveStoreNavKeys } from '@/lib/store-nav'

/** `/api/store/organization` GET のレスポンス（従来と同一形状） */
export type StoreOrganizationPayload = Awaited<ReturnType<typeof loadStoreOrganization>>

export async function loadStoreOrganization(sessionStoreId: string, memberId: string | null) {
  const [{ operator, stores }, orgAdmin, self, navSettings, navOverride] = await Promise.all([
    getOperatorStores(sessionStoreId),
    isOrgAdmin({ id: sessionStoreId, memberId }),
    prisma.store.findUnique({ where: { id: sessionStoreId }, select: { supportedServices: true, isTestStore: true } }),
    prisma.storeNavSetting.findMany({ select: { key: true, sortOrder: true, visible: true, testStoreOnly: true } }),
    prisma.storeNavOverride.findUnique({
      where: { storeId: sessionStoreId },
      select: { showAll: true, items: true },
    }),
  ])

  return {
    operator,
    stores: stores.map(s => ({
      id: s.id,
      name: s.name,
      code: s.code,
      avatar: s.avatar,
      address: s.address,
      phone: s.phone,
      storeStatus: s.storeStatus,
      memberCount: s._count.members,
    })),
    isOrgAdmin: operator ? orgAdmin : false,
    // セッション店舗の対応サービス（機能ゲート用。例: ['kaikuru','akikuru']）
    services: parseStoreServices(self?.supportedServices),
    // サイドメニューの表示キー（管理ポータルの共通設定＋この店舗の特例を解決済み・並び順つき）
    navKeys: resolveStoreNavKeys({
      settings: navSettings,
      override: navOverride,
      // テスト店舗にだけ表示する項目（管理ポータルの店舗メニュー設定）を解決するため
      isTestStore: !!self?.isTestStore,
    }),
    isTestStore: !!self?.isTestStore,
    sessionStoreId,
  }
}

/**
 * クライアント（StoreScopeProvider）へ渡す初期値。
 * RSC ペイロードに載るので、Context が実際に使う項目だけに絞る
 * （`/store/organization` ページが使う address / phone / memberCount 等は含めない）。
 */
export type StoreScopeBootstrap = {
  sessionStoreId: string
  availableStores: { id: string; name: string; code: string; avatar: string | null }[]
  isOrgAdmin: boolean
  operatorName: string | null
  services: string[]
  navKeys: string[]
}

export async function buildStoreScopeBootstrap(
  sessionStoreId: string,
  memberId: string | null,
): Promise<StoreScopeBootstrap> {
  const org = await loadStoreOrganization(sessionStoreId, memberId)
  return {
    sessionStoreId,
    availableStores: org.stores.map(s => ({ id: s.id, name: s.name, code: s.code, avatar: s.avatar })),
    isOrgAdmin: org.isOrgAdmin,
    operatorName: org.operator?.name ?? null,
    services: org.services,
    navKeys: org.navKeys,
  }
}
