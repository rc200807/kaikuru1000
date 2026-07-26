'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Empty, Pager, StatusChip, TableCard, tableStyle, tdStyle, theadRowStyle, thStyle, trStyle, yen } from '@/components/sysadmin/ui'
import { formatJstDate } from '@/lib/datetime'

// アキクル請求・分配台帳タブ

type Transfer = {
  id: string
  recipientType: string // system / hq / store
  recipientStripeAccountId: string | null
  amount: number
  stripeTransferId: string | null
  status: string // pending / succeeded / failed / retained_by_platform
  error: string | null
}

type Invoice = {
  id: string
  createdAt: string
  amount: number
  status: string // open / paid / void / uncollectible / payment_failed
  paymentMethod: string | null
  paidAt: string | null
  hostedInvoiceUrl: string | null
  distributionStatus: string // pending / processing / done / partial / failed
  distributionError: string | null
  distributedAt: string | null
  deal: { id: string; user: { id: string; name: string } | null } | null
  store: { id: string; name: string; code: string; stripeConnectStatus: string } | null
  transfers: Transfer[]
}

const LIMIT = 30

const INVOICE_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  open: { label: '未払い', bg: 'rgba(251,191,36,0.15)', fg: '#fbbf24' },
  paid: { label: '支払済', bg: 'rgba(74,222,128,0.15)', fg: '#4ade80' },
  payment_failed: { label: '決済失敗', bg: 'rgba(248,113,113,0.15)', fg: '#f87171' },
  void: { label: '無効', bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' },
  uncollectible: { label: '回収不能', bg: 'rgba(248,113,113,0.15)', fg: '#f87171' },
}

const DISTRIBUTION_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  pending: { label: '未分配', bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' },
  processing: { label: '処理中', bg: 'rgba(96,165,250,0.15)', fg: '#60a5fa' },
  done: { label: '分配済', bg: 'rgba(74,222,128,0.15)', fg: '#4ade80' },
  partial: { label: '一部失敗', bg: 'rgba(251,191,36,0.15)', fg: '#fbbf24' },
  failed: { label: '失敗', bg: 'rgba(248,113,113,0.15)', fg: '#f87171' },
}

const TRANSFER_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  pending: { label: '送金待ち', bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' },
  succeeded: { label: '送金済', bg: 'rgba(74,222,128,0.15)', fg: '#4ade80' },
  retained_by_platform: { label: 'プラットフォーム保持', bg: 'rgba(96,165,250,0.15)', fg: '#60a5fa' },
  failed: { label: '失敗', bg: 'rgba(248,113,113,0.15)', fg: '#f87171' },
}

const RECIPIENT_LABEL: Record<string, string> = {
  system: 'システム管理者',
  hq: '本部',
  store: '加盟店',
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  card: 'カード',
  customer_balance: '銀行振込',
}

const DISTRIBUTION_FILTERS = [
  { value: '', label: 'すべての分配状態' },
  { value: 'pending', label: '未分配' },
  { value: 'processing', label: '処理中' },
  { value: 'done', label: '分配済' },
  { value: 'partial', label: '一部失敗' },
  { value: 'failed', label: '失敗' },
]

function chip(map: Record<string, { label: string; bg: string; fg: string }>, key: string) {
  const s = map[key] ?? { label: key, bg: 'rgba(148,163,184,0.15)', fg: '#94a3b8' }
  return <StatusChip label={s.label} bg={s.bg} fg={s.fg} />
}

export default function RevenueTransfersTab() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [distributionStatus, setDistributionStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async (p: number, ds: string) => {
    const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) })
    if (ds) params.set('distributionStatus', ds)
    const res = await fetch(`/api/sysadmin/revenue-transfers?${params}`)
    if (!res.ok) return
    const j = await res.json()
    setInvoices(j.invoices ?? [])
    setTotal(j.total ?? 0)
  }, [])

  useEffect(() => {
    setLoading(true)
    load(page, distributionStatus).finally(() => setLoading(false))
  }, [page, distributionStatus, load])

  function flash(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  async function handleRetry(invoiceId: string) {
    setRetryingId(invoiceId)
    try {
      const res = await fetch(`/api/sysadmin/revenue-transfers/${invoiceId}/retry`, { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { flash('error', j.error ?? '分配のリトライに失敗しました'); return }
      flash('success', '分配をリトライしました')
      await load(page, distributionStatus)
    } finally {
      setRetryingId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        アキクル請求と分配（Stripe Connect送金）の台帳です。行をクリックすると分配の内訳を表示します。
      </p>

      {message && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8, fontSize: 13,
          background: message.type === 'success' ? 'rgba(74,222,128,0.12)' : 'rgba(248,113,113,0.12)',
          color: message.type === 'success' ? '#4ade80' : '#f87171',
        }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <select
          value={distributionStatus}
          onChange={e => { setDistributionStatus(e.target.value); setPage(1); setExpandedId(null) }}
          style={{
            padding: '8px 10px', borderRadius: 6, border: '1px solid var(--md-sys-color-outline-variant)',
            background: 'var(--md-sys-color-surface)', color: 'var(--md-sys-color-on-surface)', fontSize: 13,
          }}
        >
          {DISTRIBUTION_FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>全{total}件</span>
      </div>

      <TableCard>
        <table style={tableStyle}>
          <thead>
            <tr style={theadRowStyle}>
              <th style={thStyle}>発行日</th>
              <th style={thStyle}>顧客名</th>
              <th style={thStyle}>店舗</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>金額</th>
              <th style={thStyle}>支払状態</th>
              <th style={thStyle}>支払方法</th>
              <th style={thStyle}>分配状態</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 && (
              <tr><td colSpan={8}><Empty text="請求データがありません" /></td></tr>
            )}
            {invoices.map(inv => {
              const expanded = expandedId === inv.id
              const canRetry = inv.distributionStatus === 'partial' || inv.distributionStatus === 'failed'
              return (
                <Fragment key={inv.id}>
                  <tr
                    style={{ ...trStyle, cursor: 'pointer', background: expanded ? 'var(--md-sys-color-surface-container)' : undefined }}
                    onClick={() => setExpandedId(expanded ? null : inv.id)}
                  >
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatJstDate(inv.createdAt)}</td>
                    <td style={tdStyle}>{inv.deal?.user?.name ?? '—'}</td>
                    <td style={tdStyle}>{inv.store ? `${inv.store.name}（${inv.store.code}）` : '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>{yen(inv.amount)}</td>
                    <td style={tdStyle}>{chip(INVOICE_STATUS, inv.status)}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{inv.paymentMethod ? (PAYMENT_METHOD_LABEL[inv.paymentMethod] ?? inv.paymentMethod) : '—'}</td>
                    <td style={tdStyle}>{chip(DISTRIBUTION_STATUS, inv.distributionStatus)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canRetry && (
                        <button
                          onClick={e => { e.stopPropagation(); handleRetry(inv.id) }}
                          disabled={retryingId !== null}
                          style={{
                            padding: '5px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)',
                            background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 12, fontWeight: 600,
                            cursor: retryingId !== null ? 'default' : 'pointer', opacity: retryingId !== null ? 0.5 : 1,
                          }}
                        >
                          {retryingId === inv.id ? 'リトライ中…' : '分配をリトライ'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {expanded && (
                    <tr style={trStyle}>
                      <td colSpan={8} style={{ padding: '12px 16px', background: 'var(--md-sys-color-surface-container)' }}>
                        {inv.distributionError && (
                          <p style={{ margin: '0 0 10px', fontSize: 12, color: '#f87171' }}>分配エラー: {inv.distributionError}</p>
                        )}
                        {inv.transfers.length === 0 ? (
                          <p style={{ margin: 0, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>分配の内訳はまだありません</p>
                        ) : (
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                            <thead>
                              <tr style={{ textAlign: 'left', color: 'var(--md-sys-color-on-surface-variant)' }}>
                                <th style={{ padding: '6px 8px' }}>受取先</th>
                                <th style={{ padding: '6px 8px', textAlign: 'right' }}>金額</th>
                                <th style={{ padding: '6px 8px' }}>状態</th>
                                <th style={{ padding: '6px 8px' }}>送金先アカウント</th>
                              </tr>
                            </thead>
                            <tbody>
                              {inv.transfers.map(t => (
                                <tr key={t.id} style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
                                  <td style={{ padding: '6px 8px' }}>{RECIPIENT_LABEL[t.recipientType] ?? t.recipientType}</td>
                                  <td style={{ padding: '6px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>{yen(t.amount)}</td>
                                  <td style={{ padding: '6px 8px' }}>
                                    {chip(TRANSFER_STATUS, t.status)}
                                    {t.status === 'failed' && t.error && (
                                      <span style={{ marginLeft: 8, color: '#f87171' }}>{t.error}</span>
                                    )}
                                  </td>
                                  <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: 'var(--md-sys-color-on-surface-variant)' }}>
                                    {t.recipientStripeAccountId ?? '—'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </TableCard>

      <Pager page={page} totalPages={totalPages} onChange={p => { setPage(p); setExpandedId(null) }} />
    </div>
  )
}
