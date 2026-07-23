'use client'

import { Fragment, useEffect, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Empty, Pager, FilterChip, StatusChip, TableCard, tableStyle, theadRowStyle, thStyle, tdStyle, trStyle } from '@/components/sysadmin/ui'
import { formatJstDateTime } from '@/lib/datetime'

type Inquiry = {
  id: string
  name: string
  phone: string
  email: string | null
  inquiryType: string
  status: string
  details: string | null
  storeName: string
  createdAt: string
}

type Resp = {
  summary: { byStatus: { status: string; count: number }[] }
  items: Inquiry[]
  total: number
  page: number
  totalPages: number
}

const STATUS_DEFS: Record<string, { label: string; bg: string; fg: string }> = {
  new: { label: '新規', bg: 'rgba(234,179,8,0.15)', fg: '#eab308' },
  contacted: { label: '連絡済み', bg: 'rgba(96,165,250,0.15)', fg: '#60a5fa' },
  completed: { label: '完了', bg: 'rgba(46,125,50,0.15)', fg: '#66bb6a' },
}
const TYPE_LABELS: Record<string, string> = {
  assessment: '査定', purchase: '買取', estate: '遺品整理', other: 'その他',
}

export default function InquiriesTab() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [openId, setOpenId] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (status) params.set('status', status)
    fetch(`/api/sysadmin/support/inquiries?${params}`)
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false))
  }, [status, page])

  if (loading && !data) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  if (!data) return <Empty text="データを取得できませんでした" />

  const countOf = (s: string) => data.summary.byStatus.find(x => x.status === s)?.count ?? 0
  const totalAll = data.summary.byStatus.reduce((sum, s) => sum + s.count, 0)

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        全店舗宛の問い合わせを閲覧できます（対応・ステータス変更は管理ポータルから行います）
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <FilterChip active={status === ''} onClick={() => { setStatus(''); setPage(1) }}>すべて（{totalAll}）</FilterChip>
        {Object.entries(STATUS_DEFS).map(([key, def]) => (
          <FilterChip key={key} active={status === key} onClick={() => { setStatus(key); setPage(1) }}>
            {def.label}（{countOf(key)}）
          </FilterChip>
        ))}
      </div>

      <TableCard>
        <table style={tableStyle}>
          <thead>
            <tr style={theadRowStyle}>
              <th style={thStyle}>日時</th>
              <th style={thStyle}>店舗</th>
              <th style={thStyle}>氏名</th>
              <th style={thStyle}>種別</th>
              <th style={thStyle}>連絡先</th>
              <th style={thStyle}>ステータス</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>問い合わせはありません</td></tr>
            )}
            {data.items.map(i => {
              const st = STATUS_DEFS[i.status] ?? { label: i.status, bg: 'rgba(120,120,120,0.15)', fg: '#a3a3a3' }
              const open = openId === i.id
              return (
                <Fragment key={i.id}>
                  <tr
                    style={{ ...trStyle, cursor: 'pointer', background: open ? 'var(--md-sys-color-surface-container)' : undefined }}
                    onClick={() => setOpenId(open ? null : i.id)}
                  >
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatJstDateTime(i.createdAt)}</td>
                    <td style={tdStyle}>{i.storeName}</td>
                    <td style={tdStyle}>{i.name}</td>
                    <td style={tdStyle}>{TYPE_LABELS[i.inquiryType] ?? i.inquiryType}</td>
                    <td style={{ ...tdStyle, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
                      {i.phone}{i.email ? ` / ${i.email}` : ''}
                    </td>
                    <td style={tdStyle}><StatusChip {...st} /></td>
                  </tr>
                  {open && (
                    <tr style={{ background: 'var(--md-sys-color-surface-container)' }}>
                      <td colSpan={6} style={{ padding: '4px 16px 16px' }}>
                        <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4 }}>相談内容</div>
                        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {i.details?.trim() || '（詳細の記載はありません）'}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </TableCard>
      <Pager page={data.page} totalPages={data.totalPages} onChange={setPage} />
    </div>
  )
}
