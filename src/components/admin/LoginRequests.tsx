'use client'

// ID+パスワード方式（メールなし）管理者のログインリクエスト承認UI。
// - LoginRequestRow: 1件分（承認/却下ボタン付き）。メンバー管理画面と全画面通知で共用
// - LoginRequestNotifier: 管理ポータル全画面の右下に出る通知（承認者のみ・ポーリング）
import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import Button from '@/components/Button'
import type { AdminLoginRequestItem } from '@/app/api/admin/login-requests/route'

export const LOGIN_REQUEST_POLL_MS = 10_000

/** ログインリクエストを承認できるロール（src/lib/admin-login-request.ts と揃える） */
export function isLoginRequestApprover(role: unknown): boolean {
  return role === 'admin' || role === 'superadmin'
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'たった今'
  if (min < 60) return `${min}分前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}時間前`
  return `${Math.floor(hr / 24)}日前`
}

/** User-Agent を「Chrome / Windows」程度に要約（承認者が端末を見分ける手がかり） */
export function describeUserAgent(ua: string | null): string {
  if (!ua) return '不明な端末'
  const os = /iPhone|iPad/.test(ua) ? 'iOS'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'Mac'
    : /Linux/.test(ua) ? 'Linux' : ''
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari' : ''
  return [browser, os].filter(Boolean).join(' / ') || '不明な端末'
}

export function LoginRequestRow({
  item,
  onDecided,
}: {
  item: AdminLoginRequestItem
  /** 処理後に呼ばれる。error があれば失敗（すでに他の承認者が処理済み等） */
  onDecided: (id: string, result: { status?: 'approved' | 'rejected'; error?: string }) => void
}) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null)

  async function decide(action: 'approve' | 'reject') {
    setBusy(action)
    try {
      const res = await fetch(`/api/admin/login-requests/${item.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      onDecided(item.id, res.ok ? { status: data.status } : { error: data.error || '処理に失敗しました' })
    } catch {
      onDecided(item.id, { error: '処理に失敗しました' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">
          {item.admin.name}
          <span className="ml-2 font-mono text-xs text-[var(--md-sys-color-on-surface-variant)]">ID: {item.admin.loginId}</span>
        </p>
        <p className="mt-0.5 text-xs text-[var(--md-sys-color-on-surface-variant)]">
          {relativeTime(item.createdAt)} ・ {describeUserAgent(item.userAgent)}{item.ip ? ` ・ ${item.ip}` : ''}
        </p>
      </div>
      <div className="flex-shrink-0 text-center">
        <p className="text-[10px] leading-none text-[var(--md-sys-color-on-surface-variant)]">確認コード</p>
        <p className="mt-1 font-mono text-lg font-bold tracking-widest text-[var(--md-sys-color-on-surface)]">{item.code}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-1">
        <Button
          variant="text"
          size="sm"
          danger
          disabled={busy !== null}
          loading={busy === 'reject'}
          onClick={() => decide('reject')}
        >
          却下
        </Button>
        <Button
          variant="filled"
          size="sm"
          disabled={busy !== null}
          loading={busy === 'approve'}
          onClick={() => decide('approve')}
        >
          承認
        </Button>
      </div>
    </div>
  )
}

/**
 * 承認待ちのログインリクエストを取得し続けるフック。
 * タブが裏にある間は取りに行かず、前面に戻ったら即時取得する。
 */
export function usePendingLoginRequests(enabled: boolean) {
  const [pending, setPending] = useState<AdminLoginRequestItem[]>([])

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/login-requests')
      if (!res.ok) return
      const data: { pending: AdminLoginRequestItem[] } = await res.json()
      setPending(data.pending ?? [])
    } catch {
      // 通信エラーは次回ポーリングで再試行
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    refresh()
    const timer = setInterval(() => { if (!document.hidden) refresh() }, LOGIN_REQUEST_POLL_MS)
    const onVisible = () => { if (!document.hidden) refresh() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
  }, [enabled, refresh])

  const remove = useCallback((id: string) => {
    setPending(prev => prev.filter(p => p.id !== id))
  }, [])

  return { pending, refresh, remove }
}

/** 管理ポータル全画面の右下に出す通知（承認者のみ）。メンバー管理画面では本体の一覧があるので出さない */
export default function LoginRequestNotifier() {
  const { data: session } = useSession()
  const pathname = usePathname()
  const role = (session?.user as any)?.role
  const enabled = isLoginRequestApprover(role) && pathname !== '/admin/members'
  const { pending, refresh, remove } = usePendingLoginRequests(enabled)
  const [collapsed, setCollapsed] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 新しいリクエストが来たら畳んでいても開く
  const newestId = pending[0]?.id
  useEffect(() => { if (newestId) setCollapsed(false) }, [newestId])

  if (!enabled || (pending.length === 0 && !notice)) return null

  function handleDecided(id: string, result: { status?: 'approved' | 'rejected'; error?: string }) {
    const item = pending.find(p => p.id === id)
    if (result.error) {
      setNotice({ type: 'error', text: result.error })
      refresh()
    } else {
      remove(id)
      setNotice({
        type: 'success',
        text: `${item?.admin.name ?? ''} さんのログインを${result.status === 'approved' ? '承認' : '却下'}しました`,
      })
    }
    setTimeout(() => setNotice(null), 4000)
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-md" role="region" aria-label="ログインリクエスト">
      <div className="overflow-hidden rounded-2xl border border-amber-500/40 bg-[var(--md-sys-color-surface-container,#1c1c1c)] shadow-2xl">
        <button
          type="button"
          onClick={() => setCollapsed(c => !c)}
          className="flex w-full items-center gap-2 px-4 py-3 text-left"
        >
          {pending.length > 0 && (
            <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
            </span>
          )}
          <span className="flex-1 text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
            {pending.length > 0 ? `ログインリクエスト（${pending.length}件）` : 'ログインリクエスト'}
          </span>
          <svg
            className={`h-4 w-4 text-[var(--md-sys-color-on-surface-variant)] transition-transform ${collapsed ? '' : 'rotate-180'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
        {!collapsed && (
          <div className="border-t border-[var(--md-sys-color-outline-variant)]">
            {notice && (
              <p className={`px-4 pt-3 text-xs ${notice.type === 'error' ? 'text-red-400' : 'text-emerald-400'}`}>
                {notice.text}
              </p>
            )}
            <div className="max-h-[50vh] divide-y divide-[var(--md-sys-color-outline-variant)] overflow-y-auto">
              {pending.map(item => (
                <div key={item.id} className="px-4 py-3">
                  <LoginRequestRow item={item} onDecided={handleDecided} />
                </div>
              ))}
            </div>
            <p className="px-4 pb-3 pt-1 text-[11px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">
              本人に確認コードが一致するか確かめてから承認してください。
              <Link href="/admin/members" className="ml-1 underline">履歴を見る</Link>
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
