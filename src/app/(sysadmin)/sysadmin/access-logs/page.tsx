'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'

type AccessLog = {
  id: string
  userType: string
  userId: string | null
  userName: string | null
  action: string
  ip: string | null
  userAgent: string | null
  createdAt: string
}

type Resp = { logs: AccessLog[]; total: number; page: number; pageSize: number; totalPages: number }

const TYPE_LABELS: Record<string, string> = {
  customer: '顧客', store: '店舗', admin: '管理者', superadmin: '管理者(super)', hr: '管理者(HR)', sysadmin: 'システム管理者', partner: 'パートナー',
}
const TYPES = ['', 'customer', 'store', 'admin', 'superadmin', 'hr', 'sysadmin', 'partner']

export default function SysAdminAccessLogsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role as string | undefined

  const [resp, setResp] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(true)
  const [userType, setUserType] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/sysadmin/login')
    if (status === 'authenticated' && role !== 'sysadmin') router.push('/sysadmin/login')
  }, [status, role, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), pageSize: '50' })
    if (userType) params.set('userType', userType)
    fetch(`/api/sysadmin/access-logs?${params}`)
      .then(r => (r.ok ? r.json() : null))
      .then(setResp)
      .finally(() => setLoading(false))
  }, [status, userType, page])

  if (status === 'loading' || (loading && !resp)) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1080, margin: '0 auto', color: 'var(--md-sys-color-on-surface)' }}>
      <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>アクセスログ</h1>
      <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
        各ポータルのログイン履歴（{resp?.total ?? 0} 件）
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {TYPES.map(t => (
          <button
            key={t || 'all'}
            onClick={() => { setUserType(t); setPage(1) }}
            style={{
              padding: '6px 12px', borderRadius: 999, fontSize: 13, cursor: 'pointer',
              border: '1px solid var(--md-sys-color-outline-variant)',
              background: userType === t ? 'var(--md-sys-color-primary)' : 'transparent',
              color: userType === t ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface)',
              fontWeight: userType === t ? 700 : 500,
            }}
          >
            {t === '' ? 'すべて' : TYPE_LABELS[t] ?? t}
          </button>
        ))}
      </div>

      <div style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, border: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', background: 'var(--md-sys-color-surface-container)', fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
              <th style={{ padding: '10px 16px' }}>日時</th>
              <th style={{ padding: '10px 16px' }}>種別</th>
              <th style={{ padding: '10px 16px' }}>名前</th>
              <th style={{ padding: '10px 16px' }}>アクション</th>
              <th style={{ padding: '10px 16px' }}>IP</th>
            </tr>
          </thead>
          <tbody>
            {(!resp || resp.logs.length === 0) && (
              <tr><td colSpan={5} style={{ padding: 40, textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>ログがありません</td></tr>
            )}
            {resp?.logs.map(l => (
              <tr key={l.id} style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
                <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>{new Date(l.createdAt).toLocaleString('ja-JP')}</td>
                <td style={{ padding: '10px 16px' }}>{TYPE_LABELS[l.userType] ?? l.userType}</td>
                <td style={{ padding: '10px 16px' }}>{l.userName ?? '—'}</td>
                <td style={{ padding: '10px 16px' }}>{l.action}</td>
                <td style={{ padding: '10px 16px', color: 'var(--md-sys-color-on-surface-variant)' }}>{l.ip ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {resp && resp.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} style={pagerBtn(page <= 1)}>前へ</button>
          <span style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>{page} / {resp.totalPages}</span>
          <button onClick={() => setPage(p => Math.min(resp.totalPages, p + 1))} disabled={page >= resp.totalPages} style={pagerBtn(page >= resp.totalPages)}>次へ</button>
        </div>
      )}
    </div>
  )
}

function pagerBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 14px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)',
    background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13,
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
  }
}
