'use client'

import { useEffect, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Kpi, Panel, Empty, Pager, TableCard, tableStyle, theadRowStyle, thStyle, tdStyle, trStyle } from '@/components/sysadmin/ui'
import { formatJstDateTime } from '@/lib/datetime'

type Resp = {
  email: {
    byStatus: Record<string, number>
    sent24h: number
    oldestPendingAt: string | null
    failedItems: { items: { id: string; type: string; attempts: number; lastError: string | null; scheduledAt: string; updatedAt: string }[]; total: number; page: number; totalPages: number }
  }
  recording: {
    byStatus: Record<string, number>
    errorItems: { id: string; dealId: string; fileName: string | null; attempts: number; error: string | null; createdAt: string }[]
  }
}

function elapsed(from: string): string {
  const ms = Date.now() - new Date(from).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 60) return `${min}分`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}時間`
  return `${Math.floor(h / 24)}日`
}

export default function JobsTab() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/sysadmin/health/jobs?failedPage=${page}`)
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false))
  }, [page])

  if (loading && !data) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  if (!data) return <Empty text="データを取得できませんでした" />

  const e = data.email
  const r = data.recording

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        バックグラウンドジョブ（メール送信キュー・AI文字起こし）の稼働状況。cron: メールキュー 2分毎 ／ 文字起こし 毎分
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 24 }}>
        <Kpi label="メール 送信待ち" value={`${e.byStatus.pending ?? 0} 件`} accent={(e.byStatus.pending ?? 0) > 10} />
        <Kpi label="メール 送信失敗" value={`${e.byStatus.failed ?? 0} 件`} accent={(e.byStatus.failed ?? 0) > 0} />
        <Kpi label="メール 送信済み（24h）" value={`${e.sent24h} 件`} />
        <Kpi label="最古の送信待ち" value={e.oldestPendingAt ? `${elapsed(e.oldestPendingAt)}前` : '—'} accent={!!e.oldestPendingAt && Date.now() - new Date(e.oldestPendingAt).getTime() > 30 * 60000} />
        <Kpi label="文字起こし 待機中" value={`${r.byStatus.pending ?? 0} 件`} />
        <Kpi label="文字起こし エラー" value={`${r.byStatus.error ?? 0} 件`} accent={(r.byStatus.error ?? 0) > 0} />
      </div>

      <Panel title={`送信失敗メール（${e.failedItems.total} 件）`}>
        {e.failedItems.items.length === 0 ? <Empty text="送信失敗はありません" /> : (
          <>
            <TableCard>
              <table style={tableStyle}>
                <thead>
                  <tr style={theadRowStyle}>
                    <th style={thStyle}>種別</th>
                    <th style={thStyle}>試行回数</th>
                    <th style={thStyle}>エラー</th>
                    <th style={thStyle}>予定日時</th>
                    <th style={thStyle}>最終更新</th>
                  </tr>
                </thead>
                <tbody>
                  {e.failedItems.items.map(i => (
                    <tr key={i.id} style={trStyle}>
                      <td style={tdStyle}>{i.type}</td>
                      <td style={tdStyle}>{i.attempts}</td>
                      <td style={{ ...tdStyle, fontSize: 12, color: '#ef5350', wordBreak: 'break-all' }}>{i.lastError ?? '—'}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatJstDateTime(i.scheduledAt)}</td>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatJstDateTime(i.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableCard>
            <Pager page={e.failedItems.page} totalPages={e.failedItems.totalPages} onChange={setPage} />
          </>
        )}
      </Panel>

      <Panel title="文字起こしエラー（直近20件）" style={{ marginTop: 16 }}>
        {r.errorItems.length === 0 ? <Empty text="エラーはありません" /> : (
          <TableCard>
            <table style={tableStyle}>
              <thead>
                <tr style={theadRowStyle}>
                  <th style={thStyle}>ファイル名</th>
                  <th style={thStyle}>案件</th>
                  <th style={thStyle}>試行回数</th>
                  <th style={thStyle}>エラー</th>
                  <th style={thStyle}>日時</th>
                </tr>
              </thead>
              <tbody>
                {r.errorItems.map(i => (
                  <tr key={i.id} style={trStyle}>
                    <td style={tdStyle}>{i.fileName ?? '—'}</td>
                    <td style={{ ...tdStyle, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>{i.dealId}</td>
                    <td style={tdStyle}>{i.attempts}</td>
                    <td style={{ ...tdStyle, fontSize: 12, color: '#ef5350', wordBreak: 'break-all' }}>{i.error ?? '—'}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{formatJstDateTime(i.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        )}
      </Panel>
    </div>
  )
}
