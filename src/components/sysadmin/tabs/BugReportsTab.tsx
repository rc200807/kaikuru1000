'use client'

import { useEffect, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Empty, Pager, FilterChip, StatusChip, TableCard, tableStyle, theadRowStyle, thStyle, tdStyle, trStyle } from '@/components/sysadmin/ui'
import { formatJstDateTime } from '@/lib/datetime'

type ReportRow = {
  id: string
  title: string
  category: string
  status: string
  reporterName: string | null
  storeName: string
  commentCount: number
  createdAt: string
  updatedAt: string
}

type Resp = {
  summary: { byStatus: { status: string; count: number }[] }
  items: ReportRow[]
  total: number
  page: number
  totalPages: number
}

type Detail = {
  report: { id: string; title: string; category: string; status: string; details: string; imageUrls: string; reporterName: string | null; storeName: string; createdAt: string }
  comments: { id: string; authorType: string; authorName: string | null; body: string; imageUrls: string; createdAt: string }[]
}

const STATUS_DEFS: Record<string, { label: string; bg: string; fg: string }> = {
  open: { label: '未対応', bg: 'rgba(211,47,47,0.15)', fg: '#ef5350' },
  in_progress: { label: '対応中', bg: 'rgba(234,179,8,0.15)', fg: '#eab308' },
  resolved: { label: '解決済み', bg: 'rgba(46,125,50,0.15)', fg: '#66bb6a' },
}
const CATEGORY_LABELS: Record<string, string> = {
  system: 'システム', ui: '画面表示', operation: '操作', other: 'その他',
}

function parseImages(json: string): string[] {
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : []
  } catch {
    return []
  }
}

export default function BugReportsTab() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (status) params.set('status', status)
    fetch(`/api/sysadmin/support/bug-reports?${params}`)
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false))
  }, [status, page])

  function openDetail(id: string) {
    setDetailLoading(true)
    fetch(`/api/sysadmin/support/bug-reports/${id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(setDetail)
      .finally(() => setDetailLoading(false))
  }

  if (loading && !data) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  if (!data) return <Empty text="データを取得できませんでした" />

  const countOf = (s: string) => data.summary.byStatus.find(x => x.status === s)?.count ?? 0
  const totalAll = data.summary.byStatus.reduce((sum, s) => sum + s.count, 0)

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        店舗からの不具合報告を閲覧できます（対応・返信は管理ポータルから行います）
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
              <th style={thStyle}>件名</th>
              <th style={thStyle}>店舗</th>
              <th style={thStyle}>報告者</th>
              <th style={thStyle}>種別</th>
              <th style={thStyle}>コメント</th>
              <th style={thStyle}>ステータス</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>不具合報告はありません</td></tr>
            )}
            {data.items.map(b => {
              const st = STATUS_DEFS[b.status] ?? { label: b.status, bg: 'rgba(120,120,120,0.15)', fg: '#a3a3a3' }
              return (
                <tr key={b.id} style={{ ...trStyle, cursor: 'pointer' }} onClick={() => openDetail(b.id)}>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatJstDateTime(b.createdAt)}</td>
                  <td style={{ ...tdStyle, fontWeight: 600 }}>{b.title}</td>
                  <td style={tdStyle}>{b.storeName}</td>
                  <td style={tdStyle}>{b.reporterName ?? '—'}</td>
                  <td style={tdStyle}>{CATEGORY_LABELS[b.category] ?? b.category}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{b.commentCount}</td>
                  <td style={tdStyle}><StatusChip {...st} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableCard>
      <Pager page={data.page} totalPages={data.totalPages} onChange={setPage} />

      {(detail || detailLoading) && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}
          onClick={() => { setDetail(null); setDetailLoading(false) }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--md-sys-color-surface-container-high)', borderRadius: 12, padding: 24, width: '100%', maxWidth: 640, maxHeight: '80vh', overflowY: 'auto', color: 'var(--md-sys-color-on-surface)' }}
          >
            {detailLoading || !detail ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><LoadingSpinner /></div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 }}>
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{detail.report.title}</h2>
                  <StatusChip {...(STATUS_DEFS[detail.report.status] ?? { label: detail.report.status, bg: 'rgba(120,120,120,0.15)', fg: '#a3a3a3' })} />
                </div>
                <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
                  {detail.report.storeName} ／ {detail.report.reporterName ?? '—'} ／ {formatJstDateTime(detail.report.createdAt)} ／ {CATEGORY_LABELS[detail.report.category] ?? detail.report.category}
                </p>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--md-sys-color-surface-container-low)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  {detail.report.details}
                </div>
                {parseImages(detail.report.imageUrls).length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    {parseImages(detail.report.imageUrls).map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <img src={url} alt="" style={{ width: 96, height: 96, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)' }} />
                      </a>
                    ))}
                  </div>
                )}

                <h3 style={{ margin: '16px 0 8px', fontSize: 14, fontWeight: 700 }}>コメント（{detail.comments.length}）</h3>
                {detail.comments.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>コメントはありません</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {detail.comments.map(c => (
                      <div key={c.id} style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 8, padding: 10 }}>
                        <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4 }}>
                          {c.authorType === 'admin' ? '運営' : '店舗'} ／ {c.authorName ?? '—'} ／ {formatJstDateTime(c.createdAt)}
                        </div>
                        <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.body}</div>
                        {parseImages(c.imageUrls).length > 0 && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                            {parseImages(c.imageUrls).map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--md-sys-color-outline-variant)' }} />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <p style={{ margin: '16px 0 0', fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
                  ※ 対応・返信は管理ポータルの「不具合報告」から行ってください
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
