'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'
import StoreFilterSelect from '@/components/admin/StoreFilterSelect'

type Store = { id: string; name: string; code: string; prefecture?: string | null }
type Member = {
  id: string
  storeId: string
  name: string
  email: string
  avatar: string | null
  createdAt: string
  updatedAt: string
  store: Store
}

export default function AdminStoreMembersPage() {
  const { status } = useSession()
  const router = useRouter()

  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)

  const [stores, setStores] = useState<Store[]>([])
  const [storeId, setStoreId] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/stores')
      .then(r => r.ok ? r.json() : [])
      .then(d => {
        const list = Array.isArray(d) ? d : (d?.stores ?? [])
        setStores(list.map((s: any) => ({ id: s.id, name: s.name, code: s.code, prefecture: s.prefecture })))
      })
      .catch(() => {})
  }, [status])

  const queryString = useMemo(() => {
    const p = new URLSearchParams()
    if (storeId) p.set('storeId', storeId)
    if (q.trim()) p.set('q', q.trim())
    return p.toString()
  }, [storeId, q])

  useEffect(() => {
    if (status !== 'authenticated') return
    setLoading(true)
    fetch(`/api/admin/store-members?${queryString}`)
      .then(r => r.ok ? r.json() : { members: [] })
      .then((d: { members: Member[] }) => setMembers(d.members || []))
      .finally(() => setLoading(false))
  }, [status, queryString])

  // 店舗ごとの集計
  const summary = useMemo(() => {
    const counts = new Map<string, { store: Store; count: number }>()
    members.forEach(m => {
      const cur = counts.get(m.storeId)
      if (cur) cur.count++
      else counts.set(m.storeId, { store: m.store, count: 1 })
    })
    return {
      totalMembers: members.length,
      totalStores: counts.size,
    }
  }, [members])

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 56px)', color: 'var(--md-sys-color-on-surface)' }}>
      {/* ヘッダー */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
        <h1 style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 700 }}>店舗メンバー</h1>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
          全店舗で登録されているメンバー（{summary.totalMembers}名 / {summary.totalStores}店舗）
        </p>
      </div>

      {/* フィルタ */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--md-sys-color-outline-variant)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, alignItems: 'end' }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 2 }}>キーワード</label>
          <input
            type="text" value={q} onChange={e => setQ(e.target.value)}
            placeholder="氏名・メールで検索"
            style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 2 }}>店舗</label>
          <StoreFilterSelect value={storeId} onChange={setStoreId} stores={stores} />
        </div>
        {(storeId || q) && (
          <button
            type="button"
            onClick={() => { setStoreId(''); setQ('') }}
            style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline', alignSelf: 'center', justifySelf: 'start' }}
          >
            フィルタをクリア
          </button>
        )}
      </div>

      {/* 一覧 */}
      <div style={{ padding: 20, flex: 1 }}>
        {members.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 60, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>該当するメンバーがいません</p>
        ) : (
          <div style={{ borderRadius: 12, border: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden', background: 'var(--md-sys-color-surface-container)' }}>
            {/* ヘッダー行 */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '56px 1.4fr 1.4fr 1.4fr 1fr',
                gap: 12,
                padding: '10px 14px',
                fontSize: 11,
                color: 'var(--md-sys-color-on-surface-variant)',
                borderBottom: '1px solid var(--md-sys-color-outline-variant)',
                background: 'var(--md-sys-color-surface-container-high)',
              }}
            >
              <span></span>
              <span>氏名</span>
              <span>メール</span>
              <span>店舗</span>
              <span>登録日</span>
            </div>
            {members.map((m, i) => (
              <div
                key={m.id}
                onClick={() => router.push(`/admin/store-members/${m.id}`)}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--md-sys-color-surface-container-high)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
                style={{
                  padding: '10px 14px',
                  borderTop: i === 0 ? 'none' : '1px solid var(--md-sys-color-outline-variant)',
                  color: 'var(--md-sys-color-on-surface)',
                  display: 'grid',
                  gridTemplateColumns: '56px 1.4fr 1.4fr 1.4fr 1fr',
                  gap: 12,
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {/* アバター */}
                <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', background: 'var(--md-sys-color-surface-container-high)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {m.avatar ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" decoding="async" src={m.avatar} alt={m.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--md-sys-color-on-surface-variant)' }}>
                      {(m.name || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                {/* 氏名 */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                </div>
                {/* メール */}
                <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <a href={`mailto:${m.email}`} onClick={e => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none' }}>{m.email}</a>
                </div>
                {/* 店舗 */}
                <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.store.name}
                  {m.store.prefecture ? <span style={{ opacity: 0.7 }}> ・ {m.store.prefecture}</span> : null}
                </div>
                {/* 登録日 */}
                <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
                  {new Date(m.createdAt).toLocaleDateString('ja-JP')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
