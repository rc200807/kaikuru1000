'use client'

// 運営者（Operator）配下の複数店舗を「表示スコープ」として選択・保持する Context。
// - スコープはあくまで表示用。書き込みは常にセッション店舗に帰属する
// - 選択状態は localStorage（キーにセッション店舗IDを含む）に永続化。
//   StoreLink による店舗切替で token.id が変わるとキーも変わり、自動的にリセットされる
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'

export type ScopeStore = {
  id: string
  name: string
  code: string
  avatar: string | null
}

type StoreScopeValue = {
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
  loading: boolean
}

const StoreScopeContext = createContext<StoreScopeValue>({
  availableStores: [],
  selectedIds: [],
  toggleStore: () => {},
  selectAll: () => {},
  resetToSelf: () => {},
  isMulti: false,
  scopeQuery: '',
  isOrgAdmin: false,
  operatorName: null,
  loading: true,
})

export function useStoreScope() {
  return useContext(StoreScopeContext)
}

function storageKey(storeId: string) {
  return `storeScope:${storeId}`
}

export function StoreScopeProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const user = session?.user as any
  const sessionStoreId: string | null = user?.role === 'store' ? (user.id as string) : null

  const [availableStores, setAvailableStores] = useState<ScopeStore[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isOrgAdmin, setIsOrgAdmin] = useState(false)
  const [operatorName, setOperatorName] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // 組織情報の取得（セッション店舗が変わるたびに再取得＝StoreLink切替にも追随）
  useEffect(() => {
    if (status !== 'authenticated' || !sessionStoreId) {
      if (status !== 'loading') setLoading(false)
      return
    }
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

        // localStorage から復元（無効IDを除去し、セッション店舗を必ず含める）
        const validIds = new Set(stores.map(s => s.id))
        let restored: string[] = []
        try {
          const raw = localStorage.getItem(storageKey(sessionStoreId))
          if (raw) restored = (JSON.parse(raw) as string[]).filter(id => validIds.has(id))
        } catch { /* ignore */ }
        if (!restored.includes(sessionStoreId)) restored = [sessionStoreId, ...restored]
        setSelectedIds(restored)
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableStores([])
          setSelectedIds(sessionStoreId ? [sessionStoreId] : [])
        }
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [status, sessionStoreId])

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
      availableStores,
      selectedIds,
      toggleStore,
      selectAll,
      resetToSelf,
      isMulti,
      scopeQuery: isMulti ? `storeIds=${selectedIds.join(',')}` : '',
      isOrgAdmin,
      operatorName,
      loading,
    }
  }, [availableStores, selectedIds, toggleStore, selectAll, resetToSelf, isOrgAdmin, operatorName, loading])

  return <StoreScopeContext.Provider value={value}>{children}</StoreScopeContext.Provider>
}
