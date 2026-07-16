'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'
import { DEAL_STATUS_ORDER, DEAL_STATUS_LABEL, DEAL_STATUS_BADGE, type DealStatus } from '@/lib/deal-status'
import { DEAL_CATEGORY_LABEL, DEAL_CATEGORY_BADGE } from '@/lib/deal-categories'

type DealUser = { id: string; name: string; email: string | null; phone: string | null; customerType: string } | null
type DealStore = { id: string; name: string; code: string } | null

type Deal = {
  id: string
  detail: string | null
  status: string
  category: string | null
  createdAt: string
  user: DealUser
  store: DealStore
  inquiry: { id: string; inquiryType: string } | null
  _count?: { visitSchedules: number }
}

function statusColor(status: string) {
  return DEAL_STATUS_BADGE[status as DealStatus] ?? DEAL_STATUS_BADGE.inquiry
}

export default function AdminDealsPage() {
  const { status } = useSession()
  const router = useRouter()

  const [deals, setDeals] = useState<Deal[]>([])
  const [stats, setStats] = useState<{ counts: Record<string, number>; total: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState('')
  const [storeFilter, setStoreFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetchDeals()
  }, [status])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetchStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, storeFilter])

  async function fetchDeals() {
    setLoading(true)
    try {
      const res = await fetch('/api/deals?limit=200')
      if (res.ok) {
        const data = await res.json()
        setDeals(data.deals ?? [])
      }
    } finally {
      setLoading(false)
    }
  }

  async function fetchStats() {
    try {
      const params = new URLSearchParams({ stats: '1' })
      if (storeFilter) params.set('storeId', storeFilter)
      const res = await fetch(`/api/deals?${params}`)
      if (res.ok) {
        const data = await res.json()
        setStats(data.stats ?? null)
      }
    } catch {
      // ignore
    }
  }

  const stores = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>()
    deals.forEach(d => { if (d.store) map.set(d.store.id, { id: d.store.id, name: d.store.name }) })
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [deals])

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return deals.filter(d => {
      if (storeFilter && d.store?.id !== storeFilter) return false
      if (statusFilter && d.status !== statusFilter) return false
      if (q) {
        const hay = [d.user?.name ?? '', d.user?.phone ?? '', d.detail ?? ''].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [deals, searchText, storeFilter, statusFilter])

  const wonCount = (stats?.counts.contract ?? 0) + (stats?.counts.completed ?? 0)
  const statsTotal = stats?.total ?? 0
  const winRate = statsTotal > 0 ? Math.round((wonCount / statsTotal) * 1000) / 10 : 0

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)', color: 'var(--md-sys-color-on-surface)' }}>
      {/* ヘッダー */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
        <h1 style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 700 }}>案件管理</h1>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
          {storeFilter ? '選択店舗の案件' : '全店舗の案件'}（{filtered.length}件 表示 / 全{statsTotal || deals.length}件）
        </p>
        {stats && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1 }}>{winRate}<span style={{ fontSize: 14, fontWeight: 600 }}>%</span></div>
              <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginTop: 2 }}>成約率（契約+完了 / 全{statsTotal}件）</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {DEAL_STATUS_ORDER.map(s => {
                const c = DEAL_STATUS_BADGE[s]
                return (
                  <span key={s} style={{ fontSize: 12, padding: '2px 10px', borderRadius: 999, background: c.bg, color: c.fg }}>
                    {DEAL_STATUS_LABEL[s]} {stats.counts[s] ?? 0}
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* 一覧 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <aside style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', background: 'var(--md-sys-color-surface)' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--md-sys-color-outline-variant)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ position: 'relative' }}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--md-sys-color-on-surface-variant)', pointerEvents: 'none' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
              </svg>
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="検索（顧客名/電話/メモ）"
                style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px 8px 36px', borderRadius: 999, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                value={storeFilter}
                onChange={e => setStoreFilter(e.target.value)}
                style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 12 }}
              >
                <option value="">すべての店舗</option>
                {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ flex: '0 0 120px', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 12 }}
              >
                <option value="">全ステータス</option>
                {DEAL_STATUS_ORDER.map(s => <option key={s} value={s}>{DEAL_STATUS_LABEL[s]}</option>)}
              </select>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filtered.length === 0 ? (
              <p style={{ textAlign: 'center', padding: 40, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>該当する案件がありません</p>
            ) : (
              filtered.map(d => {
                const c = statusColor(d.status)
                return (
                  <button
                    key={d.id}
                    onClick={() => router.push(`/admin/deals/${d.id}`)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '12px 14px',
                      borderTop: '1px solid var(--md-sys-color-outline-variant)',
                      borderLeft: '3px solid transparent',
                      background: 'transparent',
                      cursor: 'pointer', color: 'inherit', font: 'inherit',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {d.store?.name ?? '店舗未割当'}
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {new Date(d.createdAt).toLocaleDateString('ja-JP', { year: '2-digit', month: '2-digit', day: '2-digit' })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0, flex: 1 }}>
                        {d.user?.name ?? '—'}
                      </div>
                      <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: (DEAL_CATEGORY_BADGE[d.category ?? 'purchase'] ?? DEAL_CATEGORY_BADGE.purchase).bg, color: (DEAL_CATEGORY_BADGE[d.category ?? 'purchase'] ?? DEAL_CATEGORY_BADGE.purchase).fg }}>
                          {DEAL_CATEGORY_LABEL[d.category ?? 'purchase'] ?? d.category}
                        </span>
                        <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg }}>
                          {DEAL_STATUS_LABEL[d.status as DealStatus] ?? d.status}
                        </span>
                      </span>
                    </div>
                    {d.detail && (
                      <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.detail.replace(/\n/g, ' ')}
                      </div>
                    )}
                  </button>
                )
              })
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
