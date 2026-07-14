'use client'

// 全店舗モニタリング: パフォーマンス比較 / 休眠アラート / アクティビティフィード / メンバーランキング
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'
import DataTable, { type Column } from '@/components/DataTable'
import PageNav from '@/components/list/PageNav'
import StoreFilterSelect from '@/components/admin/StoreFilterSelect'
import KpiCard from '@/components/charts/KpiCard'

type StoreRow = {
  id: string; name: string; code: string; prefecture: string | null
  customerCount: number; memberCount: number
  monthAmount: number; prevMonthAmount: number
  monthVisits: number; monthCompleted: number; monthDeals: number
  pendingDeals: number; contractRate: number | null
  lastVisitAt: string | null; lastLoginAt: string | null
  alerts: string[]
}

type FeedItem = {
  id: string; userType: string; userId: string | null; userName: string | null
  memberId: string | null; action: string; ip: string | null; createdAt: string
  storeName: string | null
}

type MemberRank = {
  memberId: string; name: string; avatar: string | null; storeId: string | null; storeName: string | null
  visitCount: number; completedCount: number; purchaseAmount: number; dealCount: number; contractCount: number
}

type MonitorTab = 'compare' | 'alerts' | 'feed' | 'members'
const MONITOR_TABS: { key: MonitorTab; label: string }[] = [
  { key: 'compare', label: 'パフォーマンス比較' },
  { key: 'alerts', label: 'アラート' },
  { key: 'feed', label: 'アクティビティ' },
  { key: 'members', label: 'メンバーランキング' },
]

function fmtDateTime(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return isNaN(dt.getTime()) ? '—' : dt.toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function momLabel(current: number, prev: number): string {
  if (prev === 0) return '—'
  const pct = ((current - prev) / prev) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`
}

export default function AdminMonitoringPage() {
  const { status } = useSession()
  const router = useRouter()

  const [tab, setTab] = useState<MonitorTab>('compare')
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab') as MonitorTab | null
    if (t && MONITOR_TABS.some(x => x.key === t)) setTab(t)
  }, [])
  const changeTab = (t: MonitorTab) => {
    setTab(t)
    const url = new URL(window.location.href)
    if (t === 'compare') url.searchParams.delete('tab')
    else url.searchParams.set('tab', t)
    window.history.replaceState(null, '', url.toString())
  }

  // ── 比較 & アラート（同一API） ──
  const [stores, setStores] = useState<StoreRow[]>([])
  const [storesLoading, setStoresLoading] = useState(true)

  // ── フィード ──
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [feedTotal, setFeedTotal] = useState(0)
  const [feedPage, setFeedPage] = useState(1)
  const [feedStoreId, setFeedStoreId] = useState('')
  const [feedAction, setFeedAction] = useState<'all' | 'login' | 'operation'>('all')
  const [feedLoading, setFeedLoading] = useState(false)
  const FEED_LIMIT = 30

  // ── メンバーランキング ──
  const [ranking, setRanking] = useState<MemberRank[]>([])
  const [rankingLoading, setRankingLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/admin/monitoring/stores')
      .then(r => r.ok ? r.json() : { stores: [] })
      .then(d => setStores(d.stores || []))
      .finally(() => setStoresLoading(false))
    fetch('/api/admin/monitoring/member-ranking')
      .then(r => r.ok ? r.json() : { ranking: [] })
      .then(d => setRanking(d.ranking || []))
      .finally(() => setRankingLoading(false))
  }, [status])

  useEffect(() => {
    if (status !== 'authenticated') return
    setFeedLoading(true)
    const qs = new URLSearchParams({ page: String(feedPage), limit: String(FEED_LIMIT) })
    if (feedStoreId) qs.set('storeId', feedStoreId)
    if (feedAction !== 'all') qs.set('action', feedAction)
    fetch(`/api/admin/access-logs?${qs}`)
      .then(r => r.ok ? r.json() : { items: [], total: 0 })
      .then(d => { setFeed(d.items || []); setFeedTotal(d.total ?? 0) })
      .finally(() => setFeedLoading(false))
  }, [status, feedPage, feedStoreId, feedAction])

  const alertStores = stores.filter(s => s.alerts.length > 0)

  const compareColumns: Column<StoreRow>[] = [
    {
      key: 'name', header: '店舗',
      render: (s) => (
        <div>
          <div className="font-medium">{s.name}</div>
          <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{s.prefecture ?? ''}{s.alerts.length > 0 && <span className="ml-1.5 text-amber-500">⚠ {s.alerts.length}</span>}</div>
        </div>
      ),
      sortable: true, sortValue: (s) => s.name,
    },
    {
      key: 'monthAmount', header: '当月買取',
      render: (s) => (
        <div className="text-right">
          <div className="tabular-nums">¥{s.monthAmount.toLocaleString()}</div>
          <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] tabular-nums">前月比 {momLabel(s.monthAmount, s.prevMonthAmount)}</div>
        </div>
      ),
      sortable: true, sortValue: (s) => s.monthAmount,
    },
    {
      key: 'monthVisits', header: '当月訪問（完了/総数）', hideOnMobile: true,
      render: (s) => <span className="tabular-nums">{s.monthCompleted} / {s.monthVisits}</span>,
      sortable: true, sortValue: (s) => s.monthVisits,
    },
    {
      key: 'monthDeals', header: '当月案件', hideOnMobile: true,
      render: (s) => <span className="tabular-nums">{s.monthDeals}</span>,
      sortable: true, sortValue: (s) => s.monthDeals,
    },
    {
      key: 'pendingDeals', header: '未対応', hideOnMobile: true,
      render: (s) => s.pendingDeals > 0
        ? <span className="tabular-nums font-bold text-amber-600">{s.pendingDeals}</span>
        : <span className="tabular-nums text-[var(--md-sys-color-on-surface-variant)]">0</span>,
      sortable: true, sortValue: (s) => s.pendingDeals,
    },
    {
      key: 'contractRate', header: '契約率', hideOnMobile: true,
      render: (s) => <span className="tabular-nums">{s.contractRate !== null ? `${(s.contractRate * 100).toFixed(0)}%` : '—'}</span>,
      sortable: true, sortValue: (s) => s.contractRate ?? -1,
    },
    {
      key: 'members', header: 'メンバー/顧客', hideOnMobile: true,
      render: (s) => <span className="tabular-nums text-[var(--md-sys-color-on-surface-variant)]">{s.memberCount}名 / {s.customerCount}名</span>,
      sortable: true, sortValue: (s) => s.customerCount,
    },
    {
      key: 'lastLoginAt', header: '最終ログイン', hideOnMobile: true,
      render: (s) => <span className="tabular-nums text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">{fmtDateTime(s.lastLoginAt)}</span>,
      sortable: true, sortValue: (s) => s.lastLoginAt ?? '',
    },
    {
      key: 'lastVisitAt', header: '最終訪問', hideOnMobile: true,
      render: (s) => <span className="tabular-nums text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">{fmtDateTime(s.lastVisitAt)}</span>,
      sortable: true, sortValue: (s) => s.lastVisitAt ?? '',
    },
  ]

  if (status === 'loading') {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }

  return (
    <div className="px-5 py-5 text-[var(--md-sys-color-on-surface)]">
      <h1 className="text-xl font-bold m-0">モニタリング</h1>
      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-0.5 mb-4">
        全店舗の稼働状況・パフォーマンスを俯瞰し、動きの止まっている店舗を検知します
      </p>

      {/* サマリー */}
      {!storesLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <KpiCard label="稼働店舗" value={String(stores.length)} unit="店舗" />
          <KpiCard label="要注意店舗" value={String(alertStores.length)} unit="店舗" sub="ログイン/訪問の停滞・未対応案件" />
          <KpiCard label="当月買取合計" value={`¥${stores.reduce((s, x) => s + x.monthAmount, 0).toLocaleString()}`} />
          <KpiCard label="未対応案件 合計" value={String(stores.reduce((s, x) => s + x.pendingDeals, 0))} unit="件" />
        </div>
      )}

      {/* ページ内タブ */}
      <div className="flex gap-1 border-b border-[var(--md-sys-color-outline-variant)] mb-5">
        {MONITOR_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => changeTab(t.key)}
            className={`px-4 py-2.5 text-[13px] bg-transparent border-0 border-b-2 -mb-px cursor-pointer ${
              tab === t.key
                ? 'font-bold text-[var(--md-sys-color-on-surface)] border-[var(--portal-primary,#4f8ef7)]'
                : 'font-medium text-[var(--md-sys-color-on-surface-variant)] border-transparent'
            }`}
          >
            {t.label}
            {t.key === 'alerts' && alertStores.length > 0 && (
              <span className="ml-1.5 text-[10px] font-bold text-white bg-amber-500 rounded-full px-1.5 py-0.5">{alertStores.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* パフォーマンス比較 */}
      {tab === 'compare' && (
        storesLoading ? <div className="flex justify-center py-16"><LoadingSpinner /></div> : (
          <div className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] overflow-hidden">
            <DataTable<StoreRow>
              columns={compareColumns}
              data={stores}
              rowKey={(s) => s.id}
              onRowClick={(s) => router.push(`/admin/stores/${s.id}`)}
              emptyTitle="店舗がありません"
            />
          </div>
        )
      )}

      {/* アラート */}
      {tab === 'alerts' && (
        storesLoading ? <div className="flex justify-center py-16"><LoadingSpinner /></div> :
        alertStores.length === 0 ? (
          <p className="text-center text-sm text-[var(--md-sys-color-on-surface-variant)] py-16">
            現在アラート対象の店舗はありません（基準: 14日ログインなし / 30日訪問なし / 未対応案件5件超）
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {alertStores.map(s => (
              <button
                key={s.id}
                onClick={() => router.push(`/admin/stores/${s.id}`)}
                className="text-left rounded-2xl p-4 border border-amber-300 bg-[color-mix(in_srgb,#f59e0b_6%,transparent)] cursor-pointer hover:border-amber-400"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm">{s.name}</span>
                  <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{s.prefecture ?? ''}</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {s.alerts.map((a, i) => (
                    <span key={i} className="text-[11px] font-medium text-amber-700 bg-amber-100 rounded-full px-2 py-0.5">{a}</span>
                  ))}
                </div>
                <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] m-0 tabular-nums">
                  最終ログイン {fmtDateTime(s.lastLoginAt)} ・ 最終訪問 {fmtDateTime(s.lastVisitAt)}
                </p>
              </button>
            ))}
          </div>
        )
      )}

      {/* アクティビティフィード */}
      {tab === 'feed' && (
        <div>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="w-60">
              <StoreFilterSelect
                value={feedStoreId}
                onChange={(id) => { setFeedStoreId(id); setFeedPage(1) }}
                stores={stores.map(s => ({ id: s.id, name: s.name, code: s.code }))}
              />
            </div>
            <div className="flex gap-1.5">
              {([['all', 'すべて'], ['login', 'ログイン'], ['operation', '操作']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => { setFeedAction(key); setFeedPage(1) }}
                  className={`h-8 px-3 rounded-full text-xs font-medium border ${
                    feedAction === key
                      ? 'border-[var(--portal-primary,#4f8ef7)] bg-[color-mix(in_srgb,var(--portal-primary,#4f8ef7)_10%,transparent)]'
                      : 'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{feedTotal.toLocaleString()}件</span>
          </div>

          <div className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)]">
            {feedLoading ? (
              <div className="flex justify-center py-16"><LoadingSpinner /></div>
            ) : feed.length === 0 ? (
              <p className="text-center text-sm text-[var(--md-sys-color-on-surface-variant)] py-16">アクティビティがありません</p>
            ) : (
              <ul className="divide-y divide-[var(--md-sys-color-surface-container-high)]">
                {feed.map(f => (
                  <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className={`w-2 h-2 rounded-full flex-none ${f.action === 'login' ? 'bg-blue-400' : 'bg-green-500'}`} />
                    <span className="w-40 flex-none truncate text-[var(--md-sys-color-on-surface-variant)]">
                      {f.storeName ?? f.userType}
                    </span>
                    <span className="w-28 flex-none truncate font-medium">{f.userName ?? '—'}</span>
                    <span className="flex-1 min-w-0 truncate">{f.action}</span>
                    <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] flex-none tabular-nums">{fmtDateTime(f.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            {Math.ceil(feedTotal / FEED_LIMIT) > 1 && (
              <div className="pb-4">
                <PageNav page={feedPage} pageCount={Math.ceil(feedTotal / FEED_LIMIT)} onChange={setFeedPage} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* メンバーランキング */}
      {tab === 'members' && (
        rankingLoading ? <div className="flex justify-center py-16"><LoadingSpinner /></div> : (
          <div>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-3">
              当月・全店舗横断のメンバー実績（memberId記録開始 2026-07 以降のデータのみ。それ以前の実績は各メンバー詳細ページで参照できます）
            </p>
            {ranking.length === 0 ? (
              <p className="text-center text-sm text-[var(--md-sys-color-on-surface-variant)] py-16">当月の実績データがまだありません</p>
            ) : (
              <div className="rounded-2xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] overflow-x-auto">
                <table className="w-full text-sm min-w-[680px]">
                  <thead>
                    <tr className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] border-b border-[var(--md-sys-color-outline-variant)]">
                      <th className="text-left px-4 py-2.5 font-medium w-12">#</th>
                      <th className="text-left px-4 py-2.5 font-medium">メンバー</th>
                      <th className="text-left px-4 py-2.5 font-medium">店舗</th>
                      <th className="text-right px-4 py-2.5 font-medium">買取金額</th>
                      <th className="text-right px-4 py-2.5 font-medium">訪問（完了/総数）</th>
                      <th className="text-right px-4 py-2.5 font-medium">案件</th>
                      <th className="text-right px-4 py-2.5 font-medium">契約</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ranking.map((r, i) => (
                      <tr
                        key={r.memberId}
                        onClick={() => router.push(`/admin/store-members/${r.memberId}`)}
                        className="border-b border-[var(--md-sys-color-surface-container-high)] cursor-pointer hover:bg-[var(--md-sys-color-surface-container-low)]"
                      >
                        <td className={`px-4 py-2.5 tabular-nums font-bold ${i < 3 ? 'text-amber-500' : 'text-[var(--md-sys-color-on-surface-variant)]'}`}>{i + 1}</td>
                        <td className="px-4 py-2.5 font-medium">{r.name}</td>
                        <td className="px-4 py-2.5 text-[var(--md-sys-color-on-surface-variant)]">{r.storeName ?? '—'}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">¥{r.purchaseAmount.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.completedCount} / {r.visitCount}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.dealCount}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.contractCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}
