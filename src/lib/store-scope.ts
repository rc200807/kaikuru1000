// 運営者（Operator）配下の複数店舗を店舗ポータルで横断表示するためのスコープ解決ヘルパー。
// - 表示スコープ = セッション店舗と同じ operatorId を持つ店舗群（?storeIds= で指定）
// - 書き込みは常にセッション店舗（session.user.id）に帰属させる。ここは「表示専用」の解決のみを担う
// - 不正な storeIds は 403 にせず黙って除外し、セッション店舗に必ずフォールバックする
//   （運営者の付け替え後に localStorage へ残った古い選択でページ全体が壊れるのを防ぐ）
import { prisma } from '@/lib/prisma'

export type StoreScope = {
  /** 検証済みの店舗ID配列。常に1件以上で、セッション店舗を必ず含む */
  storeIds: string[]
  operatorId: string | null
  isMulti: boolean
}

/** ?storeIds=a,b,c を検証して安全な店舗ID配列に解決する */
export async function resolveStoreScope(
  sessionStoreId: string,
  storeIdsParam: string | null | undefined,
): Promise<StoreScope> {
  const requested = (storeIdsParam ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  // 指定なし・自店舗のみ → 単一店舗（従来挙動）
  const others = Array.from(new Set(requested)).filter(id => id !== sessionStoreId)
  if (others.length === 0) {
    return { storeIds: [sessionStoreId], operatorId: null, isMulti: false }
  }

  const self = await prisma.store.findUnique({
    where: { id: sessionStoreId },
    select: { operatorId: true },
  })
  if (!self?.operatorId) {
    // 運営者未所属の店舗は横断表示不可 → 自店舗のみ
    return { storeIds: [sessionStoreId], operatorId: null, isMulti: false }
  }

  // 同一運営者に属する店舗のみ許可（それ以外は黙って除外）
  const valid = await prisma.store.findMany({
    where: { id: { in: others }, operatorId: self.operatorId, isActive: true },
    select: { id: true },
  })
  const storeIds = [sessionStoreId, ...valid.map(s => s.id)]
  return { storeIds, operatorId: self.operatorId, isMulti: storeIds.length > 1 }
}

export type OperatorStore = {
  id: string
  name: string
  code: string
  avatar: string | null
  address: string | null
  phone: string | null
  storeStatus: string | null
  _count: { members: number }
}

/** 運営者情報と配下店舗一覧を取得（ナビ・組織管理ページの初期化用） */
export async function getOperatorStores(sessionStoreId: string) {
  const self = await prisma.store.findUnique({
    where: { id: sessionStoreId },
    select: { operatorId: true },
  })
  if (!self?.operatorId) return { operator: null, stores: [] as OperatorStore[] }

  const [operator, stores] = await Promise.all([
    prisma.operator.findUnique({
      where: { id: self.operatorId },
      select: {
        id: true,
        entityType: true,
        corporatePrefix: true,
        prefixPosition: true,
        name: true,
        address: true,
        representativeName: true,
        phone: true,
        email: true,
        invoiceRegistered: true,
        invoiceNumber: true,
        antiquePermitNumber: true,
        service: true,
      },
    }),
    prisma.store.findMany({
      where: { operatorId: self.operatorId, isActive: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        avatar: true,
        address: true,
        phone: true,
        storeStatus: true,
        _count: { select: { members: true } },
      },
    }),
  ])
  return { operator, stores: stores as OperatorStore[] }
}

/**
 * 組織管理者かどうかを判定する。
 * - 店舗アカウント直ログイン（memberId なし）→ 常に組織管理者
 * - メンバーログイン → orgRole === 'admin' かつ「メンバーの所属店舗の運営者」＝「セッション店舗の運営者」
 *   （店舗切替後は memberId が別店舗のメンバーを指したままになるため、運営者一致の検証が必須）
 */
export async function isOrgAdmin(sessionUser: { id: string; memberId?: string | null }): Promise<boolean> {
  if (!sessionUser.memberId) return true

  const [member, sessionStore] = await Promise.all([
    prisma.storeMember.findUnique({
      where: { id: sessionUser.memberId },
      select: { orgRole: true, store: { select: { operatorId: true } } },
    }),
    prisma.store.findUnique({
      where: { id: sessionUser.id },
      select: { operatorId: true },
    }),
  ])
  if (!member || member.orgRole !== 'admin') return false
  if (!member.store.operatorId || !sessionStore?.operatorId) return false
  return member.store.operatorId === sessionStore.operatorId
}
