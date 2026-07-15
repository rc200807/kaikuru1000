'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import Card from '@/components/Card'
import Button from '@/components/Button'
import LoadingSpinner from '@/components/LoadingSpinner'
import { formalName } from '@/lib/operator-utils'

/* ─── 型 ─── */
type Operator = {
  id: string
  entityType: string | null
  corporatePrefix: string | null
  prefixPosition: string | null
  name: string
  address: string | null
  representativeName: string | null
  phone: string | null
  email: string | null
  invoiceRegistered: boolean
  invoiceNumber: string | null
  antiquePermitNumber: string | null
  service: string | null
}

type OrgStore = {
  id: string
  name: string
  code: string
  avatar: string | null
  address: string | null
  phone: string | null
  storeStatus: string | null
  memberCount: number
}

type OrgMember = {
  id: string
  name: string
  email: string
  avatar: string | null
  orgRole: string | null
  createdAt: string
  store: { id: string; name: string; code: string }
}

type EngagementData = {
  type: 'announcements' | 'videos'
  stores: { id: string; name: string }[]
  rows: {
    id: string
    title: string
    priority?: string
    publishedAt: string | null
    cells: Record<string, { readAt?: string; playCount?: number; lastViewedAt?: string } | null>
  }[]
}

const TABS = [
  { key: 'overview', label: '概要' },
  { key: 'members', label: 'メンバー' },
  { key: 'announcements', label: 'お知らせ既読' },
  { key: 'videos', label: '研修視聴' },
] as const
type TabKey = typeof TABS[number]['key']

export default function StoreOrganizationPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const sessionUser = session?.user as any

  const [tab, setTab] = useState<TabKey>('overview')
  const [operator, setOperator] = useState<Operator | null>(null)
  const [stores, setStores] = useState<OrgStore[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 運営者情報の編集
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ phone: '', email: '', address: '', invoiceNumber: '', service: '' })
  const [saving, setSaving] = useState(false)

  // メンバー
  const [members, setMembers] = useState<OrgMember[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // エンゲージメント（お知らせ/研修）
  const [engagement, setEngagement] = useState<Record<string, EngagementData | null>>({})
  const [engagementLoading, setEngagementLoading] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/store/organization')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        setOperator(data?.operator ?? null)
        setStores(data?.stores ?? [])
        setIsAdmin(!!data?.isOrgAdmin)
      })
      .finally(() => setLoading(false))
  }, [status])

  // メンバータブの読み込み
  useEffect(() => {
    if (tab !== 'members' || !isAdmin || members.length > 0) return
    setMembersLoading(true)
    fetch('/api/store/organization/members')
      .then(r => (r.ok ? r.json() : null))
      .then(data => setMembers(data?.members ?? []))
      .finally(() => setMembersLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isAdmin])

  // エンゲージメントタブの読み込み
  useEffect(() => {
    if ((tab !== 'announcements' && tab !== 'videos') || !isAdmin || engagement[tab]) return
    setEngagementLoading(true)
    fetch(`/api/store/organization/engagement?type=${tab}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => setEngagement(prev => ({ ...prev, [tab]: data })))
      .finally(() => setEngagementLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, isAdmin])

  const startEdit = useCallback(() => {
    if (!operator) return
    setEditForm({
      phone: operator.phone ?? '',
      email: operator.email ?? '',
      address: operator.address ?? '',
      invoiceNumber: operator.invoiceNumber ?? '',
      service: operator.service ?? '',
    })
    setEditing(true)
    setMessage(null)
  }, [operator])

  const saveOperator = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/store/organization', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: editForm.phone || null,
          email: editForm.email || null,
          address: editForm.address || null,
          invoiceNumber: editForm.invoiceNumber || null,
          service: editForm.service || null,
        }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || '保存に失敗しました')
      }
      const updated = await res.json()
      setOperator(prev => (prev ? { ...prev, ...updated } : prev))
      setEditing(false)
      setMessage({ type: 'success', text: '運営者情報を更新しました' })
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message ?? '保存に失敗しました' })
    } finally {
      setSaving(false)
    }
  }

  const toggleOrgRole = async (member: OrgMember) => {
    const next = member.orgRole === 'admin' ? null : 'admin'
    setTogglingId(member.id)
    try {
      const res = await fetch(`/api/store/organization/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgRole: next }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || '更新に失敗しました')
      }
      setMembers(prev => prev.map(m => (m.id === member.id ? { ...m, orgRole: next } : m)))
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message ?? '更新に失敗しました' })
    } finally {
      setTogglingId(null)
    }
  }

  if (status === 'loading' || loading) return <LoadingSpinner size="lg" fullPage />

  if (!operator) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-center">
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-2">運営者情報が登録されていません</p>
        <p className="text-xs text-[var(--md-sys-color-on-surface-faint)]">店舗と運営者の紐付けは運営事務局が行います。お問い合わせください。</p>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10 text-center">
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-2">組織管理者の権限がありません</p>
        <p className="text-xs text-[var(--md-sys-color-on-surface-faint)]">閲覧するには組織管理者に権限の付与を依頼してください。</p>
      </div>
    )
  }

  const displayName = formalName(operator)

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* ヘッダー */}
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-[var(--md-sys-color-on-surface)]">組織管理</h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--store-primary-container)] text-[var(--store-on-primary-container)]">{stores.length}店舗</span>
        </div>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-0.5">{displayName} の店舗・メンバーを一括管理</p>
      </div>

      {message && (
        <div className={`mb-4 px-4 py-3 rounded-xl text-sm font-medium ${
          message.type === 'success'
            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
            : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      {/* タブ */}
      <div className="flex gap-1 mb-6 bg-[var(--md-sys-color-surface-container)] rounded-xl p-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setMessage(null) }}
            className={`flex-1 min-w-[90px] py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] shadow-sm'
                : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ 概要タブ ═══ */}
      {tab === 'overview' && (
        <div className="space-y-6">
          {/* 運営者情報 */}
          <Card variant="elevated" padding="lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">運営者情報</h2>
              {!editing && <Button size="sm" variant="tonal" onClick={startEdit}>連絡先を編集</Button>}
            </div>

            {editing ? (
              <div className="space-y-3">
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">電話番号</label>
                    <input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] text-[var(--md-sys-color-on-surface)]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">メールアドレス</label>
                    <input value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] text-[var(--md-sys-color-on-surface)]" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">所在地</label>
                  <input value={editForm.address} onChange={e => setEditForm({ ...editForm, address: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] text-[var(--md-sys-color-on-surface)]" />
                </div>
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">インボイス番号</label>
                    <input value={editForm.invoiceNumber} onChange={e => setEditForm({ ...editForm, invoiceNumber: e.target.value })} placeholder="T1234567890123" className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] text-[var(--md-sys-color-on-surface)]" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">運営サービス</label>
                    <input value={editForm.service} onChange={e => setEditForm({ ...editForm, service: e.target.value })} className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest)] text-[var(--md-sys-color-on-surface)]" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <Button variant="text" onClick={() => setEditing(false)} disabled={saving}>キャンセル</Button>
                  <Button onClick={saveOperator} loading={saving}>保存</Button>
                </div>
              </div>
            ) : (
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div><dt className="text-xs text-[var(--md-sys-color-on-surface-variant)]">名称</dt><dd className="text-[var(--md-sys-color-on-surface)] font-medium mt-0.5">{displayName}</dd></div>
                <div><dt className="text-xs text-[var(--md-sys-color-on-surface-variant)]">代表者</dt><dd className="text-[var(--md-sys-color-on-surface)] mt-0.5">{operator.representativeName || '—'}</dd></div>
                <div><dt className="text-xs text-[var(--md-sys-color-on-surface-variant)]">電話番号</dt><dd className="text-[var(--md-sys-color-on-surface)] mt-0.5">{operator.phone || '—'}</dd></div>
                <div><dt className="text-xs text-[var(--md-sys-color-on-surface-variant)]">メール</dt><dd className="text-[var(--md-sys-color-on-surface)] mt-0.5">{operator.email || '—'}</dd></div>
                <div className="sm:col-span-2"><dt className="text-xs text-[var(--md-sys-color-on-surface-variant)]">所在地</dt><dd className="text-[var(--md-sys-color-on-surface)] mt-0.5">{operator.address || '—'}</dd></div>
                <div><dt className="text-xs text-[var(--md-sys-color-on-surface-variant)]">インボイス番号</dt><dd className="text-[var(--md-sys-color-on-surface)] mt-0.5">{operator.invoiceNumber || '—'}</dd></div>
                <div><dt className="text-xs text-[var(--md-sys-color-on-surface-variant)]">古物営業許可番号</dt><dd className="text-[var(--md-sys-color-on-surface)] mt-0.5">{operator.antiquePermitNumber || '—'}</dd></div>
                {operator.service && (
                  <div className="sm:col-span-2"><dt className="text-xs text-[var(--md-sys-color-on-surface-variant)]">運営サービス</dt><dd className="text-[var(--md-sys-color-on-surface)] mt-0.5 whitespace-pre-wrap">{operator.service}</dd></div>
                )}
              </dl>
            )}
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-faint)] mt-4">
              ※ 店舗の追加・紐付けの変更、会社形態などの変更は運営事務局へお問い合わせください。
            </p>
          </Card>

          {/* 店舗一覧 */}
          <div>
            <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)] mb-3">店舗一覧</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {stores.map(s => (
                <Card key={s.id} variant="elevated" padding="md">
                  <div className="flex items-start gap-3">
                    {s.avatar ? (
                      <img src={s.avatar} className="w-11 h-11 rounded-full object-cover shrink-0" alt="" />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-[var(--store-primary)] flex items-center justify-center shrink-0">
                        <span className="text-white text-sm font-semibold">{s.name[0]}</span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] truncate">{s.name}</p>
                        {s.id === sessionUser?.id && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--store-primary-container)] text-[var(--store-primary)] font-semibold">ログイン中</span>
                        )}
                        {s.storeStatus === 'closed' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300">閉店</span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono text-[var(--md-sys-color-on-surface-faint)]">{s.code}</p>
                      {s.address && <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1 truncate">{s.address}</p>}
                      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">メンバー {s.memberCount}名{s.phone ? ` ・ ${s.phone}` : ''}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-faint)] mt-3">
              各店舗の詳細設定は、その店舗に切り替えたうえで<Link href="/store/mystore" className="text-[var(--store-primary)] hover:underline mx-0.5">店舗情報</Link>から行えます。
            </p>
          </div>
        </div>
      )}

      {/* ═══ メンバータブ ═══ */}
      {tab === 'members' && (
        <div className="space-y-6">
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            組織管理者は、複数店舗の横断表示とこの組織管理ページを利用できます。メンバーの追加・削除は各店舗の<Link href="/store/members" className="text-[var(--store-primary)] hover:underline mx-0.5">メンバー</Link>ページから行ってください。
          </p>
          {membersLoading ? (
            <div className="py-10 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">読み込み中...</div>
          ) : members.length === 0 ? (
            <div className="py-10 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">メンバーが登録されていません</div>
          ) : (
            stores.map(s => {
              const storeMembers = members.filter(m => m.store.id === s.id)
              if (storeMembers.length === 0) return null
              return (
                <div key={s.id}>
                  <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-2 flex items-center gap-2">
                    {s.name}
                    <span className="text-[11px] font-normal text-[var(--md-sys-color-on-surface-faint)]">{storeMembers.length}名</span>
                  </h3>
                  <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] overflow-hidden divide-y divide-[var(--md-sys-color-outline-variant)]">
                    {storeMembers.map(m => (
                      <div key={m.id} className="flex items-center gap-3 px-4 py-3 bg-[var(--md-sys-color-surface)]">
                        {m.avatar ? (
                          <img src={m.avatar} className="w-9 h-9 rounded-full object-cover shrink-0" alt="" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">{m.name[0]}</span>
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] truncate">{m.name}</p>
                            {m.orgRole === 'admin' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--store-primary)] text-white font-semibold shrink-0">組織管理者</span>
                            )}
                          </div>
                          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] truncate">{m.email}</p>
                        </div>
                        <Button
                          size="sm"
                          variant={m.orgRole === 'admin' ? 'outlined' : 'tonal'}
                          onClick={() => toggleOrgRole(m)}
                          loading={togglingId === m.id}
                          disabled={togglingId !== null}
                        >
                          {m.orgRole === 'admin' ? '権限を解除' : '管理者にする'}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* ═══ お知らせ既読 / 研修視聴タブ ═══ */}
      {(tab === 'announcements' || tab === 'videos') && (
        <EngagementMatrix
          data={engagement[tab] ?? null}
          loading={engagementLoading}
          type={tab}
        />
      )}
    </div>
  )
}

/* ─── エンゲージメントマトリクス（お知らせ既読 / 研修視聴） ─── */
function EngagementMatrix({ data, loading, type }: { data: EngagementData | null; loading: boolean; type: 'announcements' | 'videos' }) {
  if (loading || !data) {
    return <div className="py-10 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">{loading ? '読み込み中...' : 'データがありません'}</div>
  }
  if (data.rows.length === 0) {
    return <div className="py-10 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">{type === 'announcements' ? 'お知らせはまだありません' : '研修動画はまだありません'}</div>
  }

  return (
    <div>
      <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-3">
        {type === 'announcements' ? '直近のお知らせの店舗別既読状況' : '直近の研修動画の店舗別視聴状況（数字は再生回数）'}
      </p>
      <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] overflow-x-auto">
        <table className="w-full text-sm min-w-[520px]">
          <thead className="bg-[var(--md-sys-color-surface-container)]">
            <tr>
              <th className="px-3 py-2.5 text-left text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] min-w-[200px]">
                {type === 'announcements' ? 'お知らせ' : '動画'}
              </th>
              {data.stores.map(s => (
                <th key={s.id} className="px-2 py-2.5 text-center text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap max-w-[110px] truncate">{s.name}</th>
              ))}
              <th className="px-3 py-2.5 text-right text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">
                {type === 'announcements' ? '既読率' : '視聴率'}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(row => {
              const doneCount = data.stores.filter(s => row.cells[s.id]).length
              const rate = data.stores.length > 0 ? Math.round((doneCount / data.stores.length) * 100) : 0
              return (
                <tr key={row.id} className="border-t border-[var(--md-sys-color-outline-variant)]">
                  <td className="px-3 py-2.5">
                    <div className="text-xs font-medium text-[var(--md-sys-color-on-surface)] line-clamp-2">{row.title}</div>
                    {row.publishedAt && (
                      <div className="text-[10px] text-[var(--md-sys-color-on-surface-faint)] mt-0.5">
                        {format(new Date(row.publishedAt), 'yyyy/M/d', { locale: ja })}
                      </div>
                    )}
                  </td>
                  {data.stores.map(s => {
                    const cell = row.cells[s.id]
                    return (
                      <td key={s.id} className="px-2 py-2.5 text-center">
                        {cell ? (
                          type === 'videos' ? (
                            <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400" title={cell.lastViewedAt ? format(new Date(cell.lastViewedAt), 'yyyy/M/d HH:mm', { locale: ja }) : undefined}>
                              ✓<span className="text-[10px] font-normal">{cell.playCount}回</span>
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 font-bold" title={cell.readAt ? format(new Date(cell.readAt), 'yyyy/M/d HH:mm', { locale: ja }) : undefined}>✓</span>
                          )
                        ) : (
                          <span className="text-[var(--md-sys-color-outline)]">—</span>
                        )}
                      </td>
                    )
                  })}
                  <td className="px-3 py-2.5 text-right">
                    <span className={`text-xs font-semibold ${rate === 100 ? 'text-emerald-600 dark:text-emerald-400' : rate >= 50 ? 'text-[var(--md-sys-color-on-surface)]' : 'text-amber-600 dark:text-amber-400'}`}>{rate}%</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
