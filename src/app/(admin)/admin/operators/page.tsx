'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'
import { ENTITY_TYPE_LABEL, formalName, type EntityType } from '@/lib/operator-utils'

type Operator = {
  id: string
  entityType: string
  corporatePrefix: string | null
  prefixPosition: string | null
  name: string
  representativeName: string
  invoiceRegistered: boolean
  phone: string | null
  email: string | null
  stores: { id: string; name: string; code: string }[]
  _count: { stores: number }
  updatedAt: string
}

export default function OperatorListPage() {
  const { status } = useSession()
  const router = useRouter()
  const [operators, setOperators] = useState<Operator[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/admin/operators')
      .then(r => r.ok ? r.json() : [])
      .then(setOperators)
      .finally(() => setLoading(false))
  }, [status])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return operators
    return operators.filter(o => {
      const hay = [o.name, o.representativeName, o.phone ?? '', o.email ?? ''].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [operators, search])

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1280, margin: '0 auto', color: 'var(--md-sys-color-on-surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>運営者情報</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
            会社情報・古物営業許可・契約書を一元管理（{filtered.length}件 / 全{operators.length}件）
          </p>
        </div>
        <button
          onClick={() => router.push('/admin/operators/new')}
          style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#4f8ef7', color: '#fff', fontSize: 13, fontWeight: 600 }}
        >
          + 新規追加
        </button>
      </div>

      {/* 検索 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ position: 'relative', maxWidth: 480 }}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--md-sys-color-on-surface-variant)', pointerEvents: 'none' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="検索（会社名/代表者/電話/メール）"
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px 8px 36px', borderRadius: 999, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
          />
        </div>
      </div>

      {/* 一覧 */}
      <div style={{ background: 'var(--md-sys-color-surface)', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 12, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 40, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
            {operators.length === 0 ? '運営者情報がまだ登録されていません' : '該当する運営者がありません'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--md-sys-color-surface-container-high)' }}>
                  <Th>会社形態</Th>
                  <Th>正式名称</Th>
                  <Th>代表者</Th>
                  <Th>店舗数</Th>
                  <Th>インボイス</Th>
                  <Th>更新日</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(op => (
                  <tr
                    key={op.id}
                    onClick={() => router.push(`/admin/operators/${op.id}`)}
                    style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', cursor: 'pointer' }}
                  >
                    <Td>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                        background: op.entityType === 'corporation' ? 'rgba(79,142,247,0.15)' : 'rgba(148,163,184,0.15)',
                        color: op.entityType === 'corporation' ? '#4f8ef7' : '#94a3b8',
                      }}>
                        {ENTITY_TYPE_LABEL[op.entityType as EntityType] ?? op.entityType}
                      </span>
                    </Td>
                    <Td>{formalName(op)}</Td>
                    <Td>{op.representativeName}</Td>
                    <Td>{op._count.stores}店舗</Td>
                    <Td>
                      {op.invoiceRegistered ? (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>登録済</span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--md-sys-color-outline)' }}>—</span>
                      )}
                    </Td>
                    <Td>{new Date(op.updatedAt).toLocaleDateString('ja-JP')}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>{children}</th>
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>{children}</td>
}
