'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import LoadingSpinner from '@/components/LoadingSpinner'
import { DEAL_STATUS_ORDER, DEAL_STATUS_LABEL, DEAL_STATUS_BADGE, type DealStatus } from '@/lib/deal-status'

type DealUser = { id: string; name: string; email: string | null; phone: string | null; customerType: string } | null
type DealStore = { id: string; name: string; code: string } | null

type Deal = {
  id: string
  detail: string | null
  status: string
  createdAt: string
  user: DealUser
  store: DealStore
  inquiry: { id: string; inquiryType: string } | null
  _count?: { visitSchedules: number }
}

type VisitScheduleLite = {
  id: string
  visitDate: string
  startTime: string | null
  endTime: string | null
  status: string
  note: string | null
  staffName: string | null
}

type DealDetail = Omit<Deal, 'inquiry'> & {
  inquiry: { id: string; inquiryType: string; details: string | null; createdAt: string } | null
  visitSchedules: VisitScheduleLite[]
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
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [detail, setDetail] = useState<DealDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailEdit, setDetailEdit] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

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

  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    setDetailLoading(true)
    fetch(`/api/deals/${selectedId}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: DealDetail | null) => {
        setDetail(d)
        setDetailEdit(d?.detail ?? '')
      })
      .finally(() => setDetailLoading(false))
  }, [selectedId])

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

  async function updateStatus(dealId: string, newStatus: string) {
    const res = await fetch(`/api/deals/${dealId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (!res.ok) return
    setDeals(prev => prev.map(x => x.id === dealId ? { ...x, status: newStatus } : x))
    setDetail(prev => prev && prev.id === dealId ? { ...prev, status: newStatus } : prev)
  }

  async function saveDetail() {
    if (!detail) return
    setSaving(true)
    const res = await fetch(`/api/deals/${detail.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ detail: detailEdit }),
    })
    setSaving(false)
    if (res.ok) {
      setDeals(prev => prev.map(x => x.id === detail.id ? { ...x, detail: detailEdit } : x))
      setDetail(prev => prev ? { ...prev, detail: detailEdit } : prev)
    }
  }

  async function deleteDeal() {
    if (!detail) return
    if (!confirm('この案件を削除しますか？（紐づく訪問予定は削除されず、リンクのみ解除されます）')) return
    setDeleting(true)
    const res = await fetch(`/api/deals/${detail.id}`, { method: 'DELETE' })
    setDeleting(false)
    if (res.ok) {
      setDeals(prev => prev.filter(x => x.id !== detail.id))
      setSelectedId(null)
      setDetail(null)
    }
  }

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

      {/* 分割レイアウト */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', overflow: 'hidden' }}>
        {/* 左ペイン: フィルタ + 一覧 */}
        <aside style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden', background: 'var(--md-sys-color-surface)' }}>
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
                const isActive = selectedId === d.id
                const c = statusColor(d.status)
                return (
                  <button
                    key={d.id}
                    onClick={() => setSelectedId(d.id)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '12px 14px',
                      borderTop: '1px solid var(--md-sys-color-outline-variant)',
                      borderLeft: isActive ? '3px solid #4f8ef7' : '3px solid transparent',
                      background: isActive ? 'rgba(79,142,247,0.1)' : 'transparent',
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
                      <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 600, background: c.bg, color: c.fg, flexShrink: 0 }}>
                        {DEAL_STATUS_LABEL[d.status as DealStatus] ?? d.status}
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

        {/* 右ペイン: 詳細 */}
        <main style={{ overflowY: 'auto' }}>
          {!selectedId ? (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--md-sys-color-on-surface-variant)', fontSize: 14, padding: 40, textAlign: 'center' }}>
              左のリストから案件を選択してください
            </div>
          ) : detailLoading || !detail ? (
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><LoadingSpinner /></div>
          ) : (
            <div style={{ padding: '20px 24px', maxWidth: 800 }}>
              {/* ヘッダー */}
              <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{detail.user?.name ?? '—'}</h2>
                  <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', marginTop: 4 }}>
                    {new Date(detail.createdAt).toLocaleString('ja-JP')}
                    {detail.store && ` ・ ${detail.store.name}（${detail.store.code}）`}
                  </div>
                </div>
                <button
                  onClick={deleteDeal}
                  disabled={deleting}
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #f87171', cursor: deleting ? 'wait' : 'pointer', background: 'transparent', color: '#f87171', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', opacity: deleting ? 0.6 : 1 }}
                >
                  {deleting ? '削除中...' : '案件を削除'}
                </button>
              </div>

              {/* ステータス変更 */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                {DEAL_STATUS_ORDER.map(s => {
                  const active = detail.status === s
                  const c = DEAL_STATUS_BADGE[s]
                  return (
                    <button
                      key={s}
                      onClick={() => !active && updateStatus(detail.id, s)}
                      style={{
                        padding: '6px 14px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: active ? 'default' : 'pointer',
                        border: active ? `1px solid ${c.fg}` : '1px solid var(--md-sys-color-outline-variant)',
                        background: active ? c.bg : 'transparent',
                        color: active ? c.fg : 'var(--md-sys-color-on-surface-variant)',
                      }}
                    >
                      {DEAL_STATUS_LABEL[s]}
                    </button>
                  )
                })}
              </div>

              {/* 顧客リンク */}
              {detail.user && (
                <div style={{ marginBottom: 16, padding: 12, background: 'var(--md-sys-color-surface-container-high)', borderRadius: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4 }}>顧客</div>
                  <Link href={`/admin/customers?focus=${detail.user.id}`} style={{ fontSize: 13, color: '#4f8ef7', textDecoration: 'none' }}>
                    {detail.user.name}{detail.user.phone && `（${detail.user.phone}）`}
                  </Link>
                </div>
              )}

              {/* 由来の問い合わせ */}
              {detail.inquiry && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4 }}>由来の問い合わせ</div>
                  <div style={{ background: 'var(--md-sys-color-surface-container)', borderRadius: 8, padding: 12, fontSize: 13 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{detail.inquiry.inquiryType}</div>
                    {detail.inquiry.details && <div style={{ whiteSpace: 'pre-wrap', color: 'var(--md-sys-color-on-surface-variant)' }}>{detail.inquiry.details}</div>}
                  </div>
                </div>
              )}

              {/* 案件メモ */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4 }}>案件メモ（買取内容など）</div>
                <textarea
                  value={detailEdit}
                  onChange={e => setDetailEdit(e.target.value)}
                  rows={6}
                  style={{ width: '100%', boxSizing: 'border-box', padding: 12, borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface)', color: 'var(--md-sys-color-on-surface)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button
                    onClick={saveDetail}
                    disabled={saving || detailEdit === (detail.detail ?? '')}
                    style={{ padding: '8px 22px', borderRadius: 8, border: 'none', cursor: saving || detailEdit === (detail.detail ?? '') ? 'default' : 'pointer', background: '#4f8ef7', color: '#fff', fontSize: 13, fontWeight: 700, opacity: saving || detailEdit === (detail.detail ?? '') ? 0.5 : 1 }}
                  >
                    {saving ? '保存中...' : 'メモを保存'}
                  </button>
                </div>
              </div>

              {/* 紐づく訪問予定 */}
              <div>
                <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 8 }}>
                  紐づく訪問予定（{detail.visitSchedules.length}件）
                </div>
                {detail.visitSchedules.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>この案件に紐づく訪問予定はありません</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {detail.visitSchedules.map(vs => (
                      <div key={vs.id} style={{ padding: 12, background: 'var(--md-sys-color-surface-container)', borderRadius: 8, fontSize: 13 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontWeight: 600 }}>
                            {new Date(vs.visitDate).toLocaleDateString('ja-JP')}
                            {vs.startTime && ` ${vs.startTime}`}{vs.endTime && `〜${vs.endTime}`}
                          </span>
                          <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>{vs.status}</span>
                        </div>
                        {vs.staffName && <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', marginTop: 2 }}>担当: {vs.staffName}</div>}
                        {vs.note && <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', marginTop: 2, whiteSpace: 'pre-wrap' }}>{vs.note}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
