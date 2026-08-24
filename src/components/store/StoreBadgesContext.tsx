'use client'

/**
 * 店舗ナビのバッジ（未読件数・リンク店舗）を 1 箇所で保持する。
 *
 * 以前は NavigationRail と BottomNav が同じ 4 本の API を別々に叩き、しかも
 * pathname が変わるたびに再取得していたため、1 ページ表示ごとに 8 リクエスト、
 * ページ遷移のたびにさらに 6 リクエストが発生していた。
 * ここで 1 回だけ取得して両方に配る。
 *
 * 更新のきっかけ:
 *  - マウント時（ログイン中の店舗が変わったときも再取得）
 *  - ウィンドウのフォーカス（15秒のスロットル付き）
 *  - 60秒ごと（タブが表示されているときのみ）
 *  - chat:activity / releasenotes:read / announcements:read イベント
 * ページ遷移では再取得しない（体感の遅さの原因だったため）。
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'

export type LinkedStore = {
  id: string
  name: string
  code: string
  avatar: string | null
}

type StoreBadges = {
  announcements: number
  releaseNotes: number
  chat: number
  /** 現在の店舗を先頭に含む配列（2件以上ならアカウント切替を表示する） */
  storeAccounts: LinkedStore[]
  refresh: () => void
}

const EMPTY: StoreBadges = {
  announcements: 0,
  releaseNotes: 0,
  chat: 0,
  storeAccounts: [],
  refresh: () => {},
}

const StoreBadgesContext = createContext<StoreBadges>(EMPTY)

export function useStoreBadges() {
  return useContext(StoreBadgesContext)
}

const POLL_MS = 60_000
const FOCUS_THROTTLE_MS = 15_000

export function StoreBadgesProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession()
  const userId = (session?.user as { id?: string } | undefined)?.id
  const [state, setState] = useState<Omit<StoreBadges, 'refresh'>>({
    announcements: 0,
    releaseNotes: 0,
    chat: 0,
    storeAccounts: [],
  })
  const lastFetchedAt = useRef(0)
  const inFlight = useRef(false)

  const load = useCallback(async () => {
    if (!userId || inFlight.current) return
    inFlight.current = true
    try {
      const res = await fetch('/api/store/badges')
      if (!res.ok) return
      const data = await res.json()
      const accounts: LinkedStore[] = data?.currentStore && Array.isArray(data?.linkedStores) && data.linkedStores.length > 0
        ? [data.currentStore, ...data.linkedStores]
        : []
      setState({
        announcements: data?.announcements ?? 0,
        releaseNotes: data?.releaseNotes ?? 0,
        chat: data?.chat ?? 0,
        storeAccounts: accounts,
      })
      lastFetchedAt.current = Date.now()
    } catch {
      /* バッジの取得失敗で画面を壊さない */
    } finally {
      inFlight.current = false
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    load()

    const onFocus = () => {
      if (Date.now() - lastFetchedAt.current > FOCUS_THROTTLE_MS) load()
    }
    const timer = setInterval(() => { if (!document.hidden) load() }, POLL_MS)

    window.addEventListener('focus', onFocus)
    window.addEventListener('chat:activity', load)
    window.addEventListener('releasenotes:read', load)
    window.addEventListener('announcements:read', load)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('chat:activity', load)
      window.removeEventListener('releasenotes:read', load)
      window.removeEventListener('announcements:read', load)
    }
  }, [userId, load])

  return (
    <StoreBadgesContext.Provider value={{ ...state, refresh: load }}>
      {children}
    </StoreBadgesContext.Provider>
  )
}
