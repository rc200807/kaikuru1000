'use client'

// 管理ダッシュボード上部の「システム概要」。システム全体の動きを一目で把握する。
// アクセス解析概要 / 分析ピックアップ / 新着店舗チャット / 直近の売買契約書 /
// 要対応アラート / 今月のメンバーTOP5 を、20秒ポーリングで最新化する。
import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import type { DashboardOverview } from '@/app/api/admin/dashboard/overview/route'

const POLL_MS = 20_000

// 分析ピックアップの算出に使う既存ダッシュボードデータのサブセット
type DashboardPickupData = {
  monthlyPurchaseAmount: { month: string; amount: number }[]
  monthlyDeals?: { month: string; count: number }[]
  contractRate?: number
  leadSourceBreakdown?: { name: string; count: number }[]
}

type MemberRankItem = {
  memberId: string
  name: string
  storeName: string | null
  purchaseAmount: number
  dealCount: number
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'たった今'
  if (min < 60) return `${min}分前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}時間前`
  return `${Math.floor(hr / 24)}日前`
}

function yen(n: number | null | undefined): string {
  if (n == null) return '—'
  return '¥' + n.toLocaleString()
}

function pctDelta(cur: number, prev: number): { text: string; up: boolean | null } {
  if (prev === 0) return { text: cur > 0 ? '新規' : '—', up: cur > 0 ? true : null }
  const d = Math.round(((cur - prev) / prev) * 1000) / 10
  return { text: `${d >= 0 ? '+' : ''}${d}%`, up: d === 0 ? null : d > 0 }
}

// ダッシュボードのダーク配色に合わせたカード枠
function Card({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-4 flex flex-col min-w-0" style={{ background: '#171717', border: '1px solid #262626' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm" style={{ color: '#ffffff', fontWeight: 600 }}>{title}</h3>
        {href && (
          <Link href={href} className="text-[11px] hover:underline" style={{ color: '#737373' }}>すべて見る →</Link>
        )}
      </div>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  )
}

export default function DashboardOverviewSection({ dashboard }: { dashboard: DashboardPickupData }) {
  const [overview, setOverview] = useState<DashboardOverview | null>(null)
  const [members, setMembers] = useState<MemberRankItem[]>([])

  const load = useCallback(async () => {
    if (document.hidden) return
    try {
      const res = await fetch('/api/admin/dashboard/overview')
      if (res.ok) setOverview(await res.json())
    } catch { /* 次回ポーリングで回復 */ }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, POLL_MS)
    return () => clearInterval(timer)
  }, [load])

  // メンバーTOP5（当月）は初回のみ取得
  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/monitoring/member-ranking')
      .then(r => (r.ok ? r.json() : { ranking: [] }))
      .then((d: { ranking: MemberRankItem[] }) => { if (!cancelled) setMembers((d.ranking ?? []).slice(0, 5)) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // ── 分析ピックアップ（計算値のみ・AI不使用） ──
  const purchase = dashboard.monthlyPurchaseAmount ?? []
  const curPurchase = purchase[purchase.length - 1]?.amount ?? 0
  const prevPurchase = purchase[purchase.length - 2]?.amount ?? 0
  const deals = dashboard.monthlyDeals ?? []
  const curDeals = deals[deals.length - 1]?.count ?? 0
  const prevDeals = deals[deals.length - 2]?.count ?? 0
  const contractRate = Math.round((dashboard.contractRate ?? 0) * 1000) / 10
  const topLead = (dashboard.leadSourceBreakdown ?? [])[0]

  const purchaseDelta = pctDelta(curPurchase, prevPurchase)
  const dealsDelta = pctDelta(curDeals, prevDeals)

  // ── 要対応アラート ──
  const a = overview?.alerts
  const alertTiles: { label: string; count: number; href: string }[] = a ? [
    { label: '未対応の問い合わせ', count: a.inquiriesNew, href: '/admin/inquiries' },
    { label: '未解決のバグ報告', count: a.bugsOpen, href: '/admin/bug-reports' },
    { label: '承認待ちの管理者', count: a.membersPendingApproval, href: '/admin/members' },
    { label: '受取待ちの宅配', count: a.deliveriesShipped, href: '/admin/deliveries?status=shipped' },
    { label: '未割り当ての顧客', count: a.unassignedCustomers, href: '/admin/customers' },
    { label: '身分証未提出', count: a.idMissing, href: '/admin/customers' },
  ] : []

  const acc = overview?.access

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm" style={{ color: '#ffffff', fontWeight: 600 }}>システム概要</h2>
        <span className="text-[11px]" style={{ color: '#737373' }}>全体の動き・20秒ごとに更新</span>
      </div>

      {/* 要対応アラート */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
        {alertTiles.map(t => {
          const active = t.count > 0
          return (
            <Link
              key={t.label}
              href={t.href}
              className="rounded-xl px-3 py-2.5 transition-colors"
              style={{
                background: active ? 'rgba(248,113,113,0.10)' : '#171717',
                border: `1px solid ${active ? 'rgba(248,113,113,0.35)' : '#262626'}`,
              }}
            >
              <div className="text-xl tracking-tight" style={{ color: active ? '#f87171' : '#525252', fontWeight: 700 }}>
                {t.count}
              </div>
              <div className="text-[10px] mt-0.5 leading-tight" style={{ color: '#a3a3a3' }}>{t.label}</div>
            </Link>
          )
        })}
      </div>

      {/* カードグリッド */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* アクセス解析概要 */}
        <Card title="アクセス解析概要" href="/admin/analytics">
          <div className="flex items-center gap-2 mb-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#4ade80' }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: '#22c55e' }} />
            </span>
            <span className="text-sm" style={{ color: '#ffffff' }}>
              <span className="text-lg font-bold">{acc?.activeVisitors ?? '—'}</span> 人が今アクティブ
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {[
              { label: '訪問者(7日)', value: acc?.last7d.visitors },
              { label: 'セッション(7日)', value: acc?.last7d.sessions },
              { label: 'PV(7日)', value: acc?.last7d.pageviews },
              { label: 'CV(7日)', value: acc?.last7d.conversions },
            ].map(m => (
              <div key={m.label} className="rounded-lg px-2.5 py-2" style={{ background: '#1f1f1f' }}>
                <div className="text-base font-semibold" style={{ color: '#ffffff' }}>{m.value ?? '—'}</div>
                <div className="text-[10px]" style={{ color: '#a3a3a3' }}>{m.label}</div>
              </div>
            ))}
          </div>
          {acc && (
            <p className="text-[10px] mt-2" style={{ color: '#737373' }}>
              CV内訳: 問い合わせ{acc.cvBreakdown.inquiry} / フォーム{acc.cvBreakdown.form} / ボタン{acc.cvBreakdown.button}
            </p>
          )}
        </Card>

        {/* 分析ピックアップ */}
        <Card title="分析ピックアップ" href="/admin/analytics">
          <div className="space-y-2">
            <PickupRow label="当月の買取金額" value={yen(curPurchase)} delta={purchaseDelta} />
            <PickupRow label="当月の案件数" value={`${curDeals}件`} delta={dealsDelta} />
            <PickupRow label="案件の成約率" value={`${contractRate}%`} />
            <PickupRow label="最多の流入経路" value={topLead ? `${topLead.name}（${topLead.count}）` : '—'} />
          </div>
        </Card>

        {/* 今月のメンバーTOP5 */}
        <Card title="今月のメンバーTOP5" href="/admin/rankings">
          {members.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: '#737373' }}>データがありません</p>
          ) : (
            <ol className="space-y-1.5">
              {members.map((m, i) => (
                <li key={m.memberId} className="flex items-center gap-2 text-xs">
                  <span className="w-4 text-center font-bold" style={{ color: i === 0 ? '#fbbf24' : '#737373' }}>{i + 1}</span>
                  <span className="flex-1 min-w-0 truncate" style={{ color: '#ffffff' }}>
                    {m.name}
                    {m.storeName && <span className="ml-1.5 text-[10px]" style={{ color: '#737373' }}>{m.storeName}</span>}
                  </span>
                  <span className="tabular-nums font-semibold" style={{ color: '#d4d4d4' }}>{yen(m.purchaseAmount)}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        {/* 新着店舗チャット */}
        <Card title="新着店舗チャット" href="/admin/chat">
          {!overview ? (
            <p className="text-xs text-center py-6" style={{ color: '#737373' }}>読み込み中...</p>
          ) : overview.chat.recent.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: '#737373' }}>メッセージはまだありません</p>
          ) : (
            <ul className="space-y-2">
              {overview.chat.recent.slice(0, 6).map((m, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span
                    className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full mt-0.5"
                    style={m.authorType === 'store'
                      ? { background: 'rgba(74,222,128,0.15)', color: '#4ade80' }
                      : { background: '#262626', color: '#a3a3a3' }}
                  >
                    {m.authorType === 'store' ? '店舗' : '管理'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-medium truncate" style={{ color: '#ffffff' }}>{m.storeName ?? '—'}</span>
                      <span className="text-[9px] shrink-0" style={{ color: '#525252' }}>{relativeTime(m.createdAt)}</span>
                    </div>
                    <p className="text-[11px] truncate" style={{ color: '#a3a3a3' }}>{m.preview}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* 直近の売買契約書 */}
        <Card title="直近の売買契約書" href="/admin/deals">
          {!overview ? (
            <p className="text-xs text-center py-6" style={{ color: '#737373' }}>読み込み中...</p>
          ) : overview.contracts.recent.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: '#737373' }}>契約はまだありません</p>
          ) : (
            <ul className="space-y-2">
              {overview.contracts.recent.slice(0, 6).map(c => (
                <li key={c.id} className="flex items-center gap-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium truncate" style={{ color: '#ffffff' }}>{c.customerName}</span>
                    {c.storeName && <span className="ml-1.5 text-[10px]" style={{ color: '#737373' }}>{c.storeName}</span>}
                  </div>
                  <span className="tabular-nums font-semibold shrink-0" style={{ color: '#d4d4d4' }}>{yen(c.amount)}</span>
                  <span className="text-[9px] shrink-0" style={{ color: '#525252' }}>{relativeTime(c.agreedAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </section>
  )
}

function PickupRow({ label, value, delta }: { label: string; value: string; delta?: { text: string; up: boolean | null } }) {
  return (
    <div className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: '#1f1f1f' }}>
      <span className="text-[11px]" style={{ color: '#a3a3a3' }}>{label}</span>
      <span className="flex items-baseline gap-1.5">
        <span className="text-sm font-semibold" style={{ color: '#ffffff' }}>{value}</span>
        {delta && (
          <span className="text-[10px] font-medium" style={{ color: delta.up === null ? '#737373' : delta.up ? '#4ade80' : '#f87171' }}>
            {delta.text}
          </span>
        )}
      </span>
    </div>
  )
}
