'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import Modal from '@/components/Modal'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmptyState from '@/components/EmptyState'

type AdminMember = {
  id: string
  name: string
  email: string
  createdAt: string
}

export default function AdminMembersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [members, setMembers] = useState<AdminMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // 削除確認モーダル
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
    if (status === 'authenticated') {
      const sessionUser = session.user as any
      if (sessionUser.role !== 'admin') router.push('/')
    }
  }, [status, session, router])

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/admin/members')
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

    const res = await fetch('/api/admin/members', {
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
    setDeleteTarget(null)

    const res = await fetch(`/api/admin/members/${id}`, { method: 'DELETE' })
    setDeletingId(null)
    if (res.ok) {
      setMembers(prev => prev.filter(m => m.id !== id))
      setMessage({ type: 'success', text: `${name} さんのアカウントを削除しました` })
    } else {
      const d = await res.json()
      setMessage({ type: 'error', text: d.error || '削除に失敗しました' })
    }
  }

  const sessionUser = session?.user as any
  const otherMembers = members.filter(m => m.id !== sessionUser?.id)

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  }

  return (
    <>
      <AppBar
        title="メンバー管理"
        subtitle="管理ポータル"
        actions={
          <Button
            variant="filled"
            size="sm"
            onClick={() => { setShowForm(true); setMessage(null) }}
            icon={
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            }
          >
            メンバー追加
          </Button>
        }
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* メッセージ */}
        {message && (
          <MessageBanner
            severity={message.type}
            dismissible
            onDismiss={() => setMessage(null)}
          >
            {message.text}
          </MessageBanner>
        )}

        {/* 自分のアカウント */}
        <Card variant="elevated" padding="none">
          <div className="px-4 sm:px-6 py-3 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
            <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide">
              自分のアカウント
            </p>
          </div>
          <div className="px-4 sm:px-6 py-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-[var(--portal-primary,#374151)] rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[var(--portal-on-primary,#fff)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{sessionUser?.name}</p>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{sessionUser?.email}</p>
            </div>
            <span className="text-xs font-medium bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] px-2.5 py-1 rounded-full">
              ログイン中
            </span>
          </div>
        </Card>

        {/* 他の管理者メンバー一覧 */}
        <Card variant="elevated" padding="none">
          <div className="px-4 sm:px-6 py-3 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
            <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide">
              その他のメンバー（{otherMembers.length}名）
            </p>
          </div>

          {otherMembers.length > 0 ? (
            otherMembers.map(member => (
              <div
                key={member.id}
                className="px-4 sm:px-6 py-4 flex items-center gap-4 border-b border-[var(--md-sys-color-surface-container-high)] last:border-0 hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors"
              >
                <div className="w-10 h-10 bg-[var(--md-sys-color-surface-container-high)] rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[var(--md-sys-color-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  loading={deletingId === member.id}
                  onClick={() => setDeleteTarget({ id: member.id, name: member.name })}
                >
                  削除
                </Button>
              </div>
            ))
          ) : (
            <EmptyState
              title="他のメンバーはいません"
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
            <Button
              variant="text"
              onClick={() => { setShowForm(false); setForm({ name: '', email: '', password: '' }) }}
            >
              キャンセル
            </Button>
            <Button
              variant="filled"
              type="submit"
              loading={saving}
              onClick={() => {
                const fakeEvent = { preventDefault: () => {} } as React.FormEvent
                handleAdd(fakeEvent)
              }}
            >
              アカウント作成
            </Button>
          </>
        }
      >
        <form onSubmit={handleAdd} className="space-y-4">
          <TextField
            label="氏名"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            required
            placeholder="例：田中 次郎"
          />
          <TextField
            label="メールアドレス"
            value={form.email}
            onChange={(v) => setForm({ ...form, email: v })}
            type="email"
            required
            placeholder="例：tanaka@kaikuru.jp"
          />
          <TextField
            label="パスワード"
            value={form.password}
            onChange={(v) => setForm({ ...form, password: v })}
            type="password"
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
        title="メンバー削除の確認"
        size="sm"
        footer={
          <>
            <Button variant="text" onClick={() => setDeleteTarget(null)}>
              キャンセル
            </Button>
            <Button
              variant="filled"
              danger
              loading={!!deletingId}
              onClick={() => {
                if (deleteTarget) handleDelete(deleteTarget.id, deleteTarget.name)
              }}
            >
              削除する
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--md-sys-color-on-surface)]">
          <span className="font-semibold">{deleteTarget?.name}</span> さんのアカウントを削除しますか？
        </p>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-2">
          この操作は取り消せません。
        </p>
      </Modal>
    </>
  )
}
