'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import SettingsShell from '../SettingsShell'

type VisitPurpose = {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
  visitCount: number
}

export default function VisitPurposesPage() {
  return (
    <SettingsShell title="訪問目的の管理">
      <VisitPurposeSection />
    </SettingsShell>
  )
}

function VisitPurposeSection() {
  const [purposes, setPurposes] = useState<VisitPurpose[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  function fetchPurposes() {
    fetch('/api/admin/visit-purposes')
      .then(r => (r.ok ? r.json() : []))
      .then(data => { setPurposes(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchPurposes() }, [])

  function handleAdd() {
    setEditingId(null)
    setFormName('')
    setShowForm(true)
    setMessage(null)
  }

  function handleEdit(p: VisitPurpose) {
    setEditingId(p.id)
    setFormName(p.name)
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
      const url = editingId ? `/api/admin/visit-purposes/${editingId}` : '/api/admin/visit-purposes'
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessage({ type: 'success', text: editingId ? '訪問目的を更新しました' : '訪問目的を追加しました' })
        handleCancel()
        fetchPurposes()
      } else {
        setMessage({ type: 'error', text: data.error || '保存に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '保存に失敗しました' })
    }
    setSaving(false)
  }

  async function patch(p: VisitPurpose, body: Record<string, unknown>, successText: string) {
    setBusyId(p.id)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/visit-purposes/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessage({ type: 'success', text: successText })
        fetchPurposes()
      } else {
        setMessage({ type: 'error', text: data.error || '更新に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '更新に失敗しました' })
    }
    setBusyId(null)
  }

  /** 隣の項目と sortOrder を入れ替える（並び替え） */
  async function move(index: number, dir: -1 | 1) {
    const target = purposes[index]
    const other = purposes[index + dir]
    if (!target || !other) return
    setBusyId(target.id)
    try {
      await Promise.all([
        fetch(`/api/admin/visit-purposes/${target.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: other.sortOrder }),
        }),
        fetch(`/api/admin/visit-purposes/${other.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sortOrder: target.sortOrder }),
        }),
      ])
      fetchPurposes()
    } catch {
      setMessage({ type: 'error', text: '並び替えに失敗しました' })
    }
    setBusyId(null)
  }

  async function handleDelete(p: VisitPurpose) {
    const note = p.visitCount > 0
      ? `\n\n${p.visitCount}件の訪問で使われています。削除しても過去の訪問には目的名が記録として残ります。`
      : ''
    if (!confirm(`「${p.name}」を削除しますか？${note}`)) return
    setBusyId(p.id)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/visit-purposes/${p.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessage({ type: 'success', text: '訪問目的を削除しました' })
        fetchPurposes()
      } else {
        setMessage({ type: 'error', text: data.error || '削除に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '削除に失敗しました' })
    }
    setBusyId(null)
  }

  return (
    <Card variant="elevated" padding="md">
      <div className="flex items-center gap-3 mb-1">
        <svg className="w-5 h-5 text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
        <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">訪問目的の管理</h3>
        <span className="ml-auto text-xs text-[var(--md-sys-color-on-surface-variant)]">
          {loading ? '' : `${purposes.length}件`}
        </span>
      </div>
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5 ml-8">
        店舗が訪問予定に設定する「訪問目的」の選択肢を管理します。並び順はそのまま店舗のプルダウンに反映されます。
        「非表示」にすると新しい訪問では選べなくなりますが、既存の訪問の記録は残ります。
      </p>

      <div className="ml-8 space-y-4">
        {message && (
          <MessageBanner severity={message.type} dismissible onDismiss={() => setMessage(null)}>
            {message.text}
          </MessageBanner>
        )}

        {!loading && purposes.length > 0 && (
          <div className="space-y-1">
            {purposes.map((p, i) => (
              <div key={p.id} className="flex items-center gap-2 py-2.5 px-3 rounded-[var(--md-sys-shape-small)] hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors">
                <div className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0 || busyId !== null}
                    className="px-1 text-[10px] leading-none text-[var(--md-sys-color-on-surface-variant)] disabled:opacity-30"
                    aria-label="上へ"
                  >▲</button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === purposes.length - 1 || busyId !== null}
                    className="px-1 text-[10px] leading-none text-[var(--md-sys-color-on-surface-variant)] disabled:opacity-30"
                    aria-label="下へ"
                  >▼</button>
                </div>
                <span className={`text-sm font-medium flex-1 ${p.isActive ? 'text-[var(--md-sys-color-on-surface)]' : 'text-[var(--md-sys-color-on-surface-variant)] line-through'}`}>
                  {p.name}
                </span>
                {!p.isActive && (
                  <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container-high)] px-2 py-0.5 rounded-full flex-shrink-0">非表示</span>
                )}
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container-high)] px-2 py-0.5 rounded-full flex-shrink-0">
                  {p.visitCount}件
                </span>
                <Button variant="text" size="sm" disabled={busyId !== null} onClick={() => handleEdit(p)}>編集</Button>
                <Button
                  variant="text"
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => patch(p, { isActive: !p.isActive }, p.isActive ? '非表示にしました' : '表示に戻しました')}
                >
                  {p.isActive ? '非表示' : '表示'}
                </Button>
                <Button variant="text" size="sm" danger disabled={busyId !== null} onClick={() => handleDelete(p)}>削除</Button>
              </div>
            ))}
          </div>
        )}

        {!loading && purposes.length === 0 && !showForm && (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            訪問目的がまだ登録されていません。追加すると店舗の訪問フォームで選べるようになります。
          </p>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="max-w-lg space-y-4 p-4 rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
            <h4 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
              {editingId ? '訪問目的を編集' : '訪問目的を追加'}
            </h4>
            <TextField label="訪問目的" value={formName} onChange={setFormName} placeholder="例: 買取査定、引き取り、遺品整理の相談" required />
            <div className="flex gap-3">
              <Button variant="filled" type="submit" loading={saving} disabled={!formName.trim()}>
                {editingId ? '更新' : '追加'}
              </Button>
              <Button variant="text" type="button" onClick={handleCancel}>キャンセル</Button>
            </div>
          </form>
        )}

        {!showForm && <Button variant="tonal" onClick={handleAdd}>追加</Button>}
      </div>
    </Card>
  )
}
