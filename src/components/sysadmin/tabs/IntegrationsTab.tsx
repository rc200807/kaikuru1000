'use client'

import { useEffect, useState } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'
import { Kpi, Panel, Empty, StatusChip, TableCard, tableStyle, theadRowStyle, thStyle, tdStyle, trStyle } from '@/components/sysadmin/ui'
import { formatJstDateTime } from '@/lib/datetime'

type Resp = {
  stripe: { count24h: number; count7d: number; lastReceivedAt: string | null; byType: { type: string; count: number }[] }
  sheetSync: { recent: { id: string; type: string; status: string; message: string | null; syncedAt: string }[]; errorCount7d: number }
  forms: { sheetErrorCount: number; apiErrorCount: number; recentErrors: { id: string; formName: string; sheetSyncError: string | null; externalApiError: string | null; createdAt: string }[] }
  listings: { byStatus: { status: string; count: number }[]; errorItems: { id: string; marketplace: string; title: string; errorMessage: string | null; updatedAt: string }[] }
}

export default function IntegrationsTab() {
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/sysadmin/health/integrations')
      .then(r => (r.ok ? r.json() : null))
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  if (!data) return <Empty text="データを取得できませんでした" />

  return (
    <div>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        外部サービス連携（Stripe・Googleスプレッドシート・フォーム外部送信・マーケット出品）の状態
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}>
        {/* Stripe */}
        <Panel title="Stripe Webhook">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <Kpi label="受信（24h）" value={`${data.stripe.count24h} 件`} />
            <Kpi label="最終受信" value={data.stripe.lastReceivedAt ? formatJstDateTime(data.stripe.lastReceivedAt, { year: undefined, month: 'numeric', day: 'numeric' }) : '—'} />
          </div>
          {data.stripe.byType.length === 0 ? <Empty text="直近7日間の受信はありません" /> : (
            <table style={tableStyle}>
              <thead>
                <tr style={theadRowStyle}>
                  <th style={{ ...thStyle, padding: '8px 4px' }}>イベント種別（7日間）</th>
                  <th style={{ ...thStyle, padding: '8px 4px', textAlign: 'right' }}>件数</th>
                </tr>
              </thead>
              <tbody>
                {data.stripe.byType.map(t => (
                  <tr key={t.type} style={trStyle}>
                    <td style={{ ...tdStyle, padding: '8px 4px' }}>{t.type}</td>
                    <td style={{ ...tdStyle, padding: '8px 4px', textAlign: 'right' }}>{t.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {/* シート同期 */}
        <Panel title={`スプレッドシート同期（7日間エラー ${data.sheetSync.errorCount7d} 件）`}>
          {data.sheetSync.recent.length === 0 ? <Empty text="同期履歴はありません" /> : (
            <table style={tableStyle}>
              <thead>
                <tr style={theadRowStyle}>
                  <th style={{ ...thStyle, padding: '8px 4px' }}>日時</th>
                  <th style={{ ...thStyle, padding: '8px 4px' }}>種別</th>
                  <th style={{ ...thStyle, padding: '8px 4px' }}>結果</th>
                  <th style={{ ...thStyle, padding: '8px 4px' }}>メッセージ</th>
                </tr>
              </thead>
              <tbody>
                {data.sheetSync.recent.map(s => (
                  <tr key={s.id} style={trStyle}>
                    <td style={{ ...tdStyle, padding: '8px 4px', whiteSpace: 'nowrap', fontSize: 12 }}>{formatJstDateTime(s.syncedAt)}</td>
                    <td style={{ ...tdStyle, padding: '8px 4px' }}>{s.type}</td>
                    <td style={{ ...tdStyle, padding: '8px 4px' }}>
                      {s.status === 'success'
                        ? <StatusChip label="成功" bg="rgba(46,125,50,0.15)" fg="#66bb6a" />
                        : <StatusChip label="エラー" bg="rgba(211,47,47,0.15)" fg="#ef5350" />}
                    </td>
                    <td style={{ ...tdStyle, padding: '8px 4px', fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', wordBreak: 'break-all' }}>{s.message ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {/* フォーム送信 */}
        <Panel title="フォーム連携エラー">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <Kpi label="シート同期エラー" value={`${data.forms.sheetErrorCount} 件`} accent={data.forms.sheetErrorCount > 0} />
            <Kpi label="外部API送信エラー" value={`${data.forms.apiErrorCount} 件`} accent={data.forms.apiErrorCount > 0} />
          </div>
          {data.forms.recentErrors.length === 0 ? <Empty text="エラーはありません" /> : (
            <table style={tableStyle}>
              <thead>
                <tr style={theadRowStyle}>
                  <th style={{ ...thStyle, padding: '8px 4px' }}>フォーム</th>
                  <th style={{ ...thStyle, padding: '8px 4px' }}>エラー</th>
                  <th style={{ ...thStyle, padding: '8px 4px' }}>日時</th>
                </tr>
              </thead>
              <tbody>
                {data.forms.recentErrors.map(f => (
                  <tr key={f.id} style={trStyle}>
                    <td style={{ ...tdStyle, padding: '8px 4px' }}>{f.formName}</td>
                    <td style={{ ...tdStyle, padding: '8px 4px', fontSize: 12, color: '#ef5350', wordBreak: 'break-all' }}>
                      {f.sheetSyncError ?? f.externalApiError ?? '—'}
                    </td>
                    <td style={{ ...tdStyle, padding: '8px 4px', whiteSpace: 'nowrap', fontSize: 12 }}>{formatJstDateTime(f.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {/* 出品 */}
        <Panel title="マーケット出品">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            {data.listings.byStatus.length === 0
              ? <span style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>出品データはありません</span>
              : data.listings.byStatus.map(s => (
                <StatusChip
                  key={s.status}
                  label={`${s.status}: ${s.count}`}
                  bg={s.status === 'error' ? 'rgba(211,47,47,0.15)' : 'rgba(120,120,120,0.15)'}
                  fg={s.status === 'error' ? '#ef5350' : '#a3a3a3'}
                />
              ))}
          </div>
          {data.listings.errorItems.length === 0 ? <Empty text="出品エラーはありません" /> : (
            <table style={tableStyle}>
              <thead>
                <tr style={theadRowStyle}>
                  <th style={{ ...thStyle, padding: '8px 4px' }}>商品</th>
                  <th style={{ ...thStyle, padding: '8px 4px' }}>マーケット</th>
                  <th style={{ ...thStyle, padding: '8px 4px' }}>エラー</th>
                </tr>
              </thead>
              <tbody>
                {data.listings.errorItems.map(l => (
                  <tr key={l.id} style={trStyle}>
                    <td style={{ ...tdStyle, padding: '8px 4px' }}>{l.title}</td>
                    <td style={{ ...tdStyle, padding: '8px 4px' }}>{l.marketplace}</td>
                    <td style={{ ...tdStyle, padding: '8px 4px', fontSize: 12, color: '#ef5350', wordBreak: 'break-all' }}>{l.errorMessage ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  )
}
