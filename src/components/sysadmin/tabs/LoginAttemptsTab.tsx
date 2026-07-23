'use client'

import { useEffect, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Kpi, Empty, Pager, FilterChip, StatusChip, TableCard, tableStyle, theadRowStyle, thStyle, tdStyle, trStyle } from '@/components/sysadmin/ui'
import { formatJstDateTime } from '@/lib/datetime'

type Resp = {
  summary: { blockedNow: number; failing24h: number }
  items: { id: string; key: string; failCount: number; firstFailAt: string; blockedUntil: string | null; updatedAt: string }[]
  total: number
  page: number
  totalPages: number
}

const ROLE_LABELS: Record<string, string> = {
  customer: '顧客', store: '店舗', admin: '管理者', superadmin: '管理者(super)', hr: '管理者(HR)', sysadmin: 'システム管理者', partner: 'パートナー',
}

export default function LoginAttemptsTab() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [onlyBlocked, setOnlyBlocked] = useState(false)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/sysadmin/security/login-attempts?page=${page}${onlyBlocked ? '&onlyBlocked=1' : ''}`)
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false))
  }, [page, onlyBlocked])

  if (loading && !data) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  if (!data) return <Empty text="データを取得できませんでした" />

  const now = Date.now()

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        ログイン失敗の発生状況とブロック中のアカウント
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Kpi label="現在ブロック中" value={`${data.summary.blockedNow} 件`} accent={data.summary.blockedNow > 0} />
        <Kpi label="失敗発生（24時間）" value={`${data.summary.failing24h} 件`} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <FilterChip active={!onlyBlocked} onClick={() => { setOnlyBlocked(false); setPage(1) }}>すべて</FilterChip>
        <FilterChip active={onlyBlocked} onClick={() => { setOnlyBlocked(true); setPage(1) }}>ブロック中のみ</FilterChip>
      </div>

      <TableCard>
        <table style={tableStyle}>
          <thead>
            <tr style={theadRowStyle}>
              <th style={thStyle}>ポータル</th>
              <th style={thStyle}>メールアドレス / ID</th>
              <th style={thStyle}>失敗回数</th>
              <th style={thStyle}>状態</th>
              <th style={thStyle}>初回失敗</th>
              <th style={thStyle}>最終更新</th>
            </tr>
          </thead>
          <tbody>
            {data.items.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 40, textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>記録はありません</td></tr>
            )}
            {data.items.map(i => {
              const sep = i.key.indexOf(':')
              const role = sep >= 0 ? i.key.slice(0, sep) : i.key
              const email = sep >= 0 ? i.key.slice(sep + 1) : ''
              const blocked = i.blockedUntil && new Date(i.blockedUntil).getTime() > now
              return (
                <tr key={i.id} style={trStyle}>
                  <td style={tdStyle}>{ROLE_LABELS[role] ?? role}</td>
                  <td style={{ ...tdStyle, wordBreak: 'break-all' }}>{email}</td>
                  <td style={tdStyle}>{i.failCount}</td>
                  <td style={tdStyle}>
                    {blocked
                      ? <StatusChip label={`ブロック中（〜${formatJstDateTime(i.blockedUntil!, { year: undefined })}）`} bg="rgba(211,47,47,0.15)" fg="#ef5350" />
                      : <StatusChip label="監視中" bg="rgba(120,120,120,0.15)" fg="#a3a3a3" />}
                  </td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatJstDateTime(i.firstFailAt)}</td>
                  <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatJstDateTime(i.updatedAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableCard>
      <Pager page={data.page} totalPages={data.totalPages} onChange={setPage} />
    </div>
  )
}
