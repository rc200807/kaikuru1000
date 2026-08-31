'use client'

/**
 * 店舗ポータルの入口。ここでは「どの店舗にログインするか」だけを選ぶ。
 *
 * メールアドレスは店舗内でのみ一意（StoreMember の @@unique([storeId, email])）なので、
 * 同じアドレスが複数の店舗で使われうる。店舗を決めずにメール＋パスワードを受け付けると
 * どの店舗に入るのかが曖昧になるため、必ず店舗を確定させてから
 * 店舗専用ログイン画面（/store/login/[storeCode]）へ送る。
 *
 * この画面は middleware の未ログイン時の戻り先でもある（?callbackUrl= が付く）ので、
 * 選択後もそのクエリを引き継ぐ。
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Card from '@/components/Card'
import LoginFooter from '@/components/LoginFooter'
import MessageBanner from '@/components/MessageBanner'
import { LAST_STORE_CODE_KEY } from '@/components/store/StoreLoginForm'

type StoreOption = { code: string; name: string }

export default function StoreLoginPage() {
  const [stores, setStores] = useState<StoreOption[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [lastCode, setLastCode] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    fetch('/api/store-login/stores')
      .then(res => (res.ok ? res.json() : Promise.reject(new Error('failed'))))
      .then((data: StoreOption[]) => setStores(Array.isArray(data) ? data : []))
      .catch(() => setLoadError('店舗一覧を取得できませんでした。時間をおいて再読み込みしてください。'))
  }, [])

  useEffect(() => {
    try { setLastCode(localStorage.getItem(LAST_STORE_CODE_KEY)) } catch { /* プライベートモード等は無視 */ }
  }, [])

  /** 選択後の遷移先。middleware が付けた ?callbackUrl= を店舗専用画面へ引き継ぐ */
  function loginHref(code: string): string {
    const cb = new URLSearchParams(window.location.search).get('callbackUrl')
    const base = `/store/login/${encodeURIComponent(code)}`
    return cb ? `${base}?callbackUrl=${encodeURIComponent(cb)}` : base
  }

  function goToStore(code: string) {
    window.location.assign(loginHref(code))
  }

  // 店舗名・店舗コードのどちらでも絞り込めるようにする（「東京」「S001」の両方で探せる）
  const filtered = useMemo(() => {
    if (!stores) return []
    const q = query.trim().toLowerCase()
    if (!q) return stores
    return stores.filter(s => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q))
  }, [stores, query])

  useEffect(() => { setHighlight(0) }, [query])

  // キーボード操作で選択中の項目が隠れないよう追従させる
  useEffect(() => {
    const el = listRef.current?.children[highlight] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlight])

  const lastStore = useMemo(
    () => (lastCode && stores ? stores.find(s => s.code === lastCode) ?? null : null),
    [lastCode, stores],
  )

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setHighlight(h => Math.min(h + 1, Math.max(filtered.length - 1, 0)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = filtered[highlight]
      if (target) goToStore(target.code)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img loading="lazy" decoding="async" src="/logo.svg" alt="買いクル" className="h-8 mx-auto" />
          </Link>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-2">店舗スタッフ ログイン</p>
        </div>

        <Card variant="elevated" padding="lg">
          <div className="mb-5">
            <p className="text-xs font-medium text-[var(--portal-primary)] tracking-widest uppercase mb-1">Store Portal</p>
            <p className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">ログインする店舗を選択</p>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
              店舗名または店舗コードで検索できます。選ぶと、その店舗専用のログイン画面へ進みます。
            </p>
          </div>

          {loadError && <MessageBanner severity="error" className="mb-5">{loadError}</MessageBanner>}

          {lastStore && (
            <button
              type="button"
              onClick={() => goToStore(lastStore.code)}
              className="w-full mb-4 flex items-center justify-between gap-2 px-4 py-3 rounded-xl border border-[var(--portal-primary)] bg-[var(--md-sys-color-surface-container-low)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors text-left"
            >
              <span className="min-w-0">
                <span className="block text-[11px] text-[var(--md-sys-color-on-surface-variant)]">前回ログインした店舗</span>
                <span className="block text-sm font-semibold text-[var(--md-sys-color-on-surface)] truncate">{lastStore.name}</span>
              </span>
              <span className="text-xs text-[var(--portal-primary)] flex-shrink-0">この店舗で続ける →</span>
            </button>
          )}

          <div className="relative">
            <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5" htmlFor="store-search">
              店舗
            </label>
            <input
              id="store-search"
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls="store-options"
              autoComplete="off"
              value={query}
              disabled={!stores && !loadError}
              onChange={e => { setQuery(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              onKeyDown={handleKeyDown}
              placeholder={stores ? '例: 東京 / S001' : '店舗を読み込み中...'}
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-on-surface-variant)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40 disabled:opacity-60"
            />

            {open && stores && (
              <ul
                id="store-options"
                ref={listRef}
                role="listbox"
                className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] divide-y divide-[var(--md-sys-color-outline-variant)]"
              >
                {filtered.length === 0 ? (
                  <li className="px-3 py-3 text-sm text-[var(--md-sys-color-on-surface-variant)]">
                    該当する店舗がありません
                  </li>
                ) : (
                  filtered.map((s, i) => (
                    <li key={s.code} role="option" aria-selected={i === highlight}>
                      <button
                        type="button"
                        onMouseEnter={() => setHighlight(i)}
                        onClick={() => goToStore(s.code)}
                        className={`w-full text-left px-3 py-2.5 flex items-center justify-between gap-2 transition-colors ${
                          i === highlight ? 'bg-[var(--md-sys-color-surface-container-high)]' : 'hover:bg-[var(--md-sys-color-surface-container-high)]'
                        }`}
                      >
                        <span className="text-sm text-[var(--md-sys-color-on-surface)] truncate">{s.name}</span>
                        <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">{s.code}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>

          <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-4 leading-relaxed">
            店舗専用のログインURL（例: /store/login/S001）をブックマークしておくと、次回から店舗の選択を省けます。
          </p>
        </Card>

        <LoginFooter />
      </div>
    </div>
  )
}
