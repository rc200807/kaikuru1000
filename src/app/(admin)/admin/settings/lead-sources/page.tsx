'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import SettingsShell from '../SettingsShell'

export default function LeadSourcesPage() {
  return (
    <SettingsShell title="流入経路管理">
      <LeadSourceSection />
    </SettingsShell>
  )
}

function LeadSourceSection() {
  const [sources, setSources] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [saving, setSaving] = useState(false)

  function fetchSources() {
    fetch('/api/admin/lead-sources')
      .then(r => r.json())
      .then(data => { setSources(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchSources() }, [])

  function handleAdd() {
    setEditingId(null)
    setFormName('')
    setShowForm(true)
    setMessage(null)
  }

  function handleEdit(s: any) {
    setEditingId(s.id)
    setFormName(s.name)
    setShowForm(true)
    setMessage(null)
  }

  function handleCancel() {
    setShowForm(false)
    setEditingId(null)
    setFormName('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formName.trim()) return
    setSaving(true)
    setMessage(null)

    try {
      const url = editingId
        ? `/api/admin/lead-sources/${editingId}`
        : '/api/admin/lead-sources'
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim(), ...(editingId ? {} : { sortOrder: sources.length }) }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: editingId ? '流入経路を更新しました' : '流入経路を追加しました' })
        setShowForm(false)
        setEditingId(null)
        setFormName('')
        fetchSources()
      } else {
        setMessage({ type: 'error', text: data.error || '保存に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '保存に失敗しました' })
    }
    setSaving(false)
  }

  async function handleDelete(s: any) {
    if (!confirm(`「${s.name}」を削除しますか？\n（既存顧客に設定済みの流入経路はそのまま残ります）`)) return
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/lead-sources/${s.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: '流入経路を削除しました' })
        fetchSources()
      } else {
        setMessage({ type: 'error', text: data.error || '削除に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '削除に失敗しました' })
    }
  }

  return (
    <Card variant="elevated" padding="md">
      <div className="flex items-center gap-3 mb-1">
        <svg className="w-5 h-5 text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
        <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">流入経路管理</h3>
        <span className="ml-auto text-xs text-[var(--md-sys-color-on-surface-variant)]">
          {loading ? '' : `${sources.length}件`}
        </span>
      </div>
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5 ml-8">
        顧客登録時に選択する流入経路（電話・お問い合わせフォーム・LINE・紹介・おいくら など）を管理します。
      </p>

      <div className="ml-8 space-y-4">
        {message && (
          <MessageBanner severity={message.type} dismissible onDismiss={() => setMessage(null)}>
            {message.text}
          </MessageBanner>
        )}

        {!loading && sources.length > 0 && (
          <div className="space-y-1">
            {sources.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 py-2.5 px-3 rounded-[var(--md-sys-shape-small)] hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors">
                <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)] flex-1">{s.name}</span>
                <Button variant="text" size="sm" onClick={() => handleEdit(s)}>編集</Button>
                <Button variant="text" size="sm" danger onClick={() => handleDelete(s)}>削除</Button>
              </div>
            ))}
          </div>
        )}

        {!loading && sources.length === 0 && !showForm && (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">流入経路がまだ登録されていません。</p>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="max-w-lg space-y-4 p-4 rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
            <h4 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
              {editingId ? '流入経路を編集' : '流入経路を追加'}
            </h4>
            <TextField label="名称" value={formName} onChange={setFormName} placeholder="例: 電話、紹介、おいくら" required />
            <div className="flex gap-3">
              <Button variant="filled" type="submit" loading={saving} disabled={!formName.trim()}>
                {editingId ? '更新' : '追加'}
              </Button>
              <Button variant="text" type="button" onClick={handleCancel}>キャンセル</Button>
            </div>
          </form>
        )}

        {!showForm && (
          <Button variant="tonal" onClick={handleAdd}>追加</Button>
        )}
      </div>
    </Card>
  )
}
