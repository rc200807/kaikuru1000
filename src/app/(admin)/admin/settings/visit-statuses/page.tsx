'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import SettingsShell from '../SettingsShell'

const COLOR_PRESETS = [
  { color: '#3B82F6', name: '青' },
  { color: '#10B981', name: '緑' },
  { color: '#F59E0B', name: '黄' },
  { color: '#EF4444', name: '赤' },
  { color: '#8B5CF6', name: '紫' },
  { color: '#6B7280', name: '灰' },
]

const SYSTEM_KEYS = ['scheduled', 'completed']

export default function VisitStatusesPage() {
  return (
    <SettingsShell title="訪問ステータス管理">
      <VisitStatusSection />
    </SettingsShell>
  )
}

function VisitStatusSection() {
  const [statuses, setStatuses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formKey, setFormKey] = useState('')
  const [formLabel, setFormLabel] = useState('')
  const [formColor, setFormColor] = useState('#6B7280')
  const [formSortOrder, setFormSortOrder] = useState(0)
  const [saving, setSaving] = useState(false)

  function fetchStatuses() {
    fetch('/api/admin/visit-statuses')
      .then(r => r.json())
      .then(data => { setStatuses(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchStatuses() }, [])

  function handleAdd() {
    setEditingId(null)
    setFormKey('')
    setFormLabel('')
    setFormColor('#6B7280')
    setFormSortOrder(statuses.length)
    setShowForm(true)
    setMessage(null)
  }

  function handleEdit(s: any) {
    setEditingId(s.id)
    setFormKey(s.key)
    setFormLabel(s.label)
    setFormColor(s.color)
    setFormSortOrder(s.sortOrder)
    setShowForm(true)
    setMessage(null)
  }

  function handleCancel() {
    setShowForm(false)
    setEditingId(null)
    setFormKey('')
    setFormLabel('')
    setFormColor('#6B7280')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!formLabel.trim()) return
    if (!editingId && !formKey.trim()) return
    setSaving(true)
    setMessage(null)

    try {
      const url = editingId
        ? `/api/admin/visit-statuses/${editingId}`
        : '/api/admin/visit-statuses'
      const method = editingId ? 'PATCH' : 'POST'
      const payload: any = {
        label: formLabel.trim(),
        color: formColor,
        sortOrder: formSortOrder,
      }
      if (!editingId) {
        payload.key = formKey.trim()
      }
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: editingId ? 'ステータスを更新しました' : 'ステータスを追加しました' })
        setShowForm(false)
        setEditingId(null)
        setFormKey('')
        setFormLabel('')
        setFormColor('#6B7280')
        fetchStatuses()
      } else {
        setMessage({ type: 'error', text: data.error || '保存に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '保存に失敗しました' })
    }
    setSaving(false)
  }

  async function handleDelete(s: any) {
    if (!confirm(`「${s.label}」を削除しますか？`)) return
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/visit-statuses/${s.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: 'ステータスを削除しました' })
        fetchStatuses()
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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
        </svg>
        <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">訪問ステータス管理</h3>
        <span className="ml-auto text-xs text-[var(--md-sys-color-on-surface-variant)]">
          {loading ? '' : `${statuses.length}件`}
        </span>
      </div>
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5 ml-8">
        訪問スケジュールのステータスを管理します。
      </p>

      <div className="ml-8 space-y-4">
        {message && (
          <MessageBanner severity={message.type} dismissible onDismiss={() => setMessage(null)}>
            {message.text}
          </MessageBanner>
        )}

        {!loading && statuses.length > 0 && (
          <div className="space-y-1">
            {statuses.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 py-2.5 px-3 rounded-[var(--md-sys-shape-small)] hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)] flex-1">{s.label}</span>
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container-high)] px-2 py-0.5 rounded-full flex-shrink-0 font-mono">{s.key}</span>
                <Button variant="text" size="sm" onClick={() => handleEdit(s)}>編集</Button>
                {!SYSTEM_KEYS.includes(s.key) && (
                  <Button variant="text" size="sm" danger onClick={() => handleDelete(s)}>削除</Button>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && statuses.length === 0 && !showForm && (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">ステータスがまだ登録されていません。</p>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="max-w-lg space-y-4 p-4 rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
            <h4 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
              {editingId ? 'ステータスを編集' : 'ステータスを追加'}
            </h4>
            {!editingId && (
              <TextField label="キー（英字）" value={formKey} onChange={setFormKey} placeholder="例: follow_up" required helper="半角英数字とアンダースコアのみ使用できます" />
            )}
            {editingId && (
              <div className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
                キー: <span className="font-mono font-medium">{formKey}</span>
              </div>
            )}
            <TextField label="表示名" value={formLabel} onChange={setFormLabel} placeholder="例: フォローアップ" required />
            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">カラー</label>
              <div className="flex items-center gap-2 mb-2">
                {COLOR_PRESETS.map(p => (
                  <button
                    key={p.color}
                    type="button"
                    onClick={() => setFormColor(p.color)}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${formColor === p.color ? 'border-[var(--md-sys-color-on-surface)] scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: p.color }}
                    title={p.name}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={formColor} onChange={e => setFormColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border border-[var(--md-sys-color-outline-variant)]" />
                <input type="text" value={formColor} onChange={e => setFormColor(e.target.value)} className="text-sm font-mono px-2 py-1 border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] w-24" placeholder="#000000" />
              </div>
            </div>
            <TextField label="表示順" value={String(formSortOrder)} onChange={v => setFormSortOrder(parseInt(v) || 0)} type="number" />
            <div className="flex gap-3">
              <Button variant="filled" type="submit" loading={saving} disabled={!formLabel.trim() || (!editingId && !formKey.trim())}>
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
