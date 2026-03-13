'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AppBar from '@/components/AppBar'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Modal from '@/components/Modal'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmptyState from '@/components/EmptyState'

type Member = {
  id: string
  name: string
  email: string
  createdAt: string
}

export default function StoreMembersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // 削除確認モーダル
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/store/members')
        .then(r => r.json())
        .then(data => {
          setMembers(Array.isArray(data) ? data : [])
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }
  }, [status])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const res = await fetch('/api/store/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    setSaving(false)
    if (res.ok) {
      const created = await res.json()
      setMembers(prev => [...prev, created])
      setMessage({ type: 'success', text: `${form.name} さんのアカウントを作成しました` })
      setShowForm(false)
      setForm({ name: '', email: '', password: '' })
    } else {
      const d = await res.json()
      setMessage({ type: 'error', text: d.error || 'アカウントの作成に失敗しました' })
    }
  }

  async function handleDelete(id: string, name: string) {
    setDeletingId(id)

    const res = await fetch(`/api/store/members/${id}`, { method: 'DELETE' })
    setDeletingId(null)
    setDeleteTarget(null)
    if (res.ok) {
      setMembers(prev => prev.filter(m => m.id !== id))
      setMessage({ type: 'success', text: `${name} さんのアカウントを削除しました` })
    } else {
      const d = await res.json()
      setMessage({ type: 'error', text: d.error || '削除に失敗しました' })
    }
  }

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  }

  return (
    <>
      <AppBar
        title="メンバー管理"
        subtitle="店舗ポータルにログインできるアカウント"
        actions={
          <Button onClick={() => { setShowForm(true); setMessage(null) }} size="sm">
            メンバー追加
          </Button>
        }
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {message && (
          <MessageBanner
            severity={message.type}
            dismissible
            onDismiss={() => setMessage(null)}
            className="mb-6"
          >
            {message.text}
          </MessageBanner>
        )}

        <Card variant="outlined" padding="none">
          {/* 店舗アカウント（オーナー） */}
          <div className="px-4 sm:px-6 py-3 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
            <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide">店舗アカウント（オーナー）</p>
          </div>
          <div className="px-4 sm:px-6 py-4 flex items-center gap-4 border-b border-[var(--md-sys-color-surface-container-high)]">
            <div className="w-9 h-9 bg-[var(--status-scheduled-bg)] rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-[var(--portal-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{(session?.user as any)?.name}</p>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{(session?.user as any)?.email}</p>
            </div>
            <span className="text-xs font-medium bg-[var(--status-scheduled-bg)] text-[var(--portal-primary)] px-2.5 py-1 rounded-full flex-shrink-0">
              オーナー
            </span>
          </div>

          {/* メンバー一覧 */}
          {members.length > 0 && (
            <>
              <div className="px-4 sm:px-6 py-3 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
                <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide">
                  追加メンバー（{members.length}名）
                </p>
              </div>
              {members.map(member => (
                <div key={member.id} className="px-4 sm:px-6 py-4 flex items-center gap-4 border-b border-[var(--md-sys-color-surface-container-high)] last:border-0 hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors">
                  <div className="w-9 h-9 bg-[var(--md-sys-color-surface-container-high)] rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-[var(--md-sys-color-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">{member.name}</p>
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{member.email}</p>
                  </div>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0 hidden sm:block">
                    {format(new Date(member.createdAt), 'yyyy/M/d 追加', { locale: ja })}
                  </p>
                  <Button
                    variant="text"
                    size="sm"
                    danger
                    disabled={deletingId === member.id}
                    onClick={() => setDeleteTarget({ id: member.id, name: member.name })}
                  >
                    削除
                  </Button>
                </div>
              ))}
            </>
          )}

          {members.length === 0 && (
            <EmptyState
              title="追加メンバーはいません"
              description="「メンバー追加」からアカウントを発行できます"
            />
          )}
        </Card>
      </div>

      {/* メンバー追加モーダル */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setForm({ name: '', email: '', password: '' }) }}
        title="メンバー追加"
        size="sm"
        footer={
          <>
            <Button variant="text" onClick={() => { setShowForm(false); setForm({ name: '', email: '', password: '' }) }}>
              キャンセル
            </Button>
            <Button
              type="submit"
              loading={saving}
              onClick={() => {
                const formEl = document.getElementById('add-member-form') as HTMLFormElement
                formEl?.requestSubmit()
              }}
            >
              {saving ? '作成中...' : 'アカウント作成'}
            </Button>
          </>
        }
      >
        <form id="add-member-form" onSubmit={handleAdd} className="space-y-4">
          <TextField
            label="氏名"
            value={form.name}
            onChange={v => setForm({ ...form, name: v })}
            required
            placeholder="例：山田 太郎"
          />
          <TextField
            label="メールアドレス"
            type="email"
            value={form.email}
            onChange={v => setForm({ ...form, email: v })}
            required
            placeholder="例：yamada@example.com"
          />
          <TextField
            label="パスワード"
            type="password"
            value={form.password}
            onChange={v => setForm({ ...form, password: v })}
            required
            placeholder="6文字以上"
            helper="このパスワードをメンバーに伝えてください"
          />
        </form>
      </Modal>

      {/* 削除確認モーダル */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="メンバーの削除"
        size="sm"
        footer={
          <>
            <Button variant="text" onClick={() => setDeleteTarget(null)}>キャンセル</Button>
            <Button
              danger
              loading={deletingId === deleteTarget?.id}
              onClick={() => deleteTarget && handleDelete(deleteTarget.id, deleteTarget.name)}
            >
              削除する
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <p className="text-sm text-[var(--md-sys-color-on-surface)]">
            <strong>{deleteTarget.name}</strong> さんのアカウントを削除しますか？この操作は取り消せません。
          </p>
        )}
      </Modal>
    </>
  )
}
