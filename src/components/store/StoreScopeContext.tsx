'use client'

// 運営者（Operator）配下の複数店舗を「表示スコープ」として選択・保持する Context。
// - スコープはあくまで表示用。書き込みは常にセッション店舗に帰属する
// - 選択状態は localStorage（キーにセッション店舗IDを含む）に永続化。
//   StoreLink による店舗切替で token.id が変わるとキーも変わり、自動的にリセットされる
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { DEFAULT_STORE_NAV_KEYS, STORE_NAV_KEYS } from '@/lib/store-nav'
import type { StoreScopeBootstrap } from '@/lib/store-bootstrap'

export type ScopeStore = {
  id: string
  name: string
  code: string
  avatar: string | null
}

type StoreScopeValue = {
  /** ログイン中の店舗ID。書き込みは常にこの店舗に帰属するので、行の「自店舗か」判定に使う */
  sessionStoreId: string | null
  /** 運営者配下の店舗（セッション店舗含む）。運営者なしなら [] */
  availableStores: ScopeStore[]
  /** 選択中の店舗ID。常にセッション店舗を含む */
  selectedIds: string[]
  toggleStore: (id: string) => void
  selectAll: () => void
  resetToSelf: () => void
  isMulti: boolean
  /** 複数選択時 'storeIds=a,b,c'。単一時は ''（既存API挙動を変えない） */
  scopeQuery: string
  isOrgAdmin: boolean
  operatorName: string | null
  /** セッション店舗の対応サービス（機能ゲート用。例: ['kaikuru','akikuru']） */
  services: string[]
  /** 表示するサイドメニューのキー（並び順つき。管理ポータルの設定＋店舗特例を解決した結果） */
  navKeys: string[]
  loading: boolean
}

const StoreScopeContext = createContext<StoreScopeValue>({
  sessionStoreId: null,
  availableStores: [],
  selectedIds: [],
  toggleStore: () => {},
  selectAll: () => {},
  resetToSelf: () => {},
  isMulti: false,
  scopeQuery: '',
  isOrgAdmin: false,
  operatorName: null,
  services: [],
  navKeys: [...DEFAULT_STORE_NAV_KEYS],
  loading: true,
})

export function useStoreScope() {
  return useContext(StoreScopeContext)
}

function storageKey(storeId: string) {
  return `storeScope:${storeId}`
}

/** 未知キーを除いた文字列配列に正規化 */
function sanitizeNavKeys(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const keys = value.filter((k): k is string => typeof k === 'string' && STORE_NAV_KEYS.includes(k))
  return keys.length > 0 ? keys : null
}

/** localStorage から選択店舗を復元する（無効IDを除き、セッション店舗を必ず含める） */
function readSelection(sessionStoreId: string, stores: ScopeStore[]): string[] {
  const valid = new Set(stores.map(s => s.id))
  let restored: string[] = []
  try {
    const raw = localStorage.getItem(storageKey(sessionStoreId))
    if (raw) restored = (JSON.parse(raw) as string[]).filter(id => valid.has(id))
  } catch { /* ignore */ }
  if (!restored.includes(sessionStoreId)) restored = [sessionStoreId, ...restored]
  return restored
}

/**
 * @param initial サーバー（layout.tsx）が解決した初期値。
 *   これがあると `/api/store/organization` のクライアント往復（実測 0.3 秒）が丸ごと消える。
 *   null のとき（ロール不一致・取得失敗）は従来どおりクライアントで取得する。
 */
export function StoreScopeProvider({ initial, children }: { initial?: StoreScopeBootstrap | null; children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const user = session?.user as any
  const sessionStoreId: string | null = user?.role === 'store' ? (user.id as string) : null

  const [availableStores, setAvailableStores] = useState<ScopeStore[]>(initial?.availableStores ?? [])
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initial?.sessionStoreId ? [initial.sessionStoreId] : [],
  )
  const [isOrgAdmin, setIsOrgAdmin] = useState(initial?.isOrgAdmin ?? false)
  const [operatorName, setOperatorName] = useState<string | null>(initial?.operatorName ?? null)
  const [services, setServices] = useState<string[]>(initial?.services ?? [])
  // サーバー初期値があればそれが正。無いときだけ既定値から始める
  // （以前は localStorage キャッシュで繋いでいたが、初期値が render 0 から正しいので不要になった）
  const [navKeys, setNavKeys] = useState<string[]>(initial?.navKeys ?? [...DEFAULT_STORE_NAV_KEYS])

  // 複数店舗を持ちうるか。**サーバーで確定する値**なので、サーバーレンダーと
  // 第1クライアントレンダーで必ず一致する（ハイドレーション不一致を構造的に避ける鍵）
  const canMulti = (initial?.availableStores.length ?? 0) > 1
  // 選択店舗だけは localStorage 由来でサーバーが知り得ないため、復元済みかを別に持つ。
  // 単一店舗（大多数）は復元の必要が無いので **render 0 の時点で確定済み** とみなす
  const [restored, setRestored] = useState(!!initial && !canMulti)
  const [loading, setLoading] = useState(!initial)

  // localStorage の復元はハイドレート後の effect の中だけで行う（同期・ネットワーク往復ゼロ）
  useEffect(() => {
    if (!initial || !canMulti || !initial.sessionStoreId) return
    setSelectedIds(readSelection(initial.sessionStoreId, initial.availableStores))
    setRestored(true)
  }, [initial, canMulti])

  // 組織情報の取得。サーバー初期値がある初回はスキップし、
  // 店舗切替（StoreLink で sessionStoreId が変わる）や初期値なしのときだけ走る
  const initialStoreId = initial?.sessionStoreId ?? null
  useEffect(() => {
    if (status !== 'authenticated' || !sessionStoreId) {
      if (status !== 'loading') { setLoading(false); setRestored(true) }
      return
    }
    // サーバーが解決済みの店舗と同じなら取得不要
    if (initialStoreId && initialStoreId === sessionStoreId) return
    let cancelled = false
    setLoading(true)
    fetch('/api/store/organization')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelled) return
        const stores: ScopeStore[] = (data?.stores ?? []).map((s: any) => ({
          id: s.id, name: s.name, code: s.code, avatar: s.avatar ?? null,
        }))
        setAvailableStores(stores)
        setIsOrgAdmin(!!data?.isOrgAdmin)
        setOperatorName(data?.operator?.name ?? null)
        setServices(Array.isArray(data?.services) ? data.services : [])
        const resolvedNav = sanitizeNavKeys(data?.navKeys)
        if (resolvedNav) setNavKeys(resolvedNav)
        setSelectedIds(readSelection(sessionStoreId, stores))
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableStores([])
          setSelectedIds(sessionStoreId ? [sessionStoreId] : [])
        }
      })
      .finally(() => { if (!cancelled) { setLoading(false); setRestored(true) } })
    return () => { cancelled = true }
  }, [status, sessionStoreId, initialStoreId])

  const persist = useCallback((ids: string[]) => {
    if (!sessionStoreId) return
    try { localStorage.setItem(storageKey(sessionStoreId), JSON.stringify(ids)) } catch { /* ignore */ }
  }, [sessionStoreId])

  const toggleStore = useCallback((id: string) => {
    if (!sessionStoreId || id === sessionStoreId) return // セッション店舗は外せない
    setSelectedIds(prev => {
      const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      persist(next)
      return next
    })
  }, [sessionStoreId, persist])

  const selectAll = useCallback(() => {
    const next = availableStores.map(s => s.id)
    if (sessionStoreId && !next.includes(sessionStoreId)) next.unshift(sessionStoreId)
    setSelectedIds(next)
    persist(next)
  }, [availableStores, sessionStoreId, persist])

  const resetToSelf = useCallback(() => {
    if (!sessionStoreId) return
    setSelectedIds([sessionStoreId])
    persist([sessionStoreId])
  }, [sessionStoreId, persist])

  const value = useMemo<StoreScopeValue>(() => {
    const isMulti = selectedIds.length > 1
    return {
      sessionStoreId: sessionStoreId ?? null,
      availableStores,
      selectedIds,
      toggleStore,
      selectAll,
      resetToSelf,
      isMulti,
      scopeQuery: isMulti ? `storeIds=${selectedIds.join(',')}` : '',
      isOrgAdmin,
      operatorName,
      services,
      navKeys,
      // 「スコープ未確定」の意味。サーバー初期値がある場合は
      // ネットワーク待ちではなく localStorage 復元待ち（1レンダー・往復ゼロ）になる。
      // 各ページのゲート（`if (... || scope.loading) return`）はそのまま使える
      loading: loading || !restored,
    }
  }, [sessionStoreId, availableStores, selectedIds, toggleStore, selectAll, resetToSelf, isOrgAdmin, operatorName, services, navKeys, loading, restored])

  return <StoreScopeContext.Provider value={value}>{children}</StoreScopeContext.Provider>
}
