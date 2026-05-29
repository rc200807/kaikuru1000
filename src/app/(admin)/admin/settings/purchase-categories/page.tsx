'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import SettingsShell from '../SettingsShell'

export default function PurchaseCategoriesPage() {
  return (
    <SettingsShell title="買取カテゴリ管理">
      <PurchaseCategorySection />
    </SettingsShell>
  )
}

function PurchaseCategorySection() {
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [saving, setSaving] = useState(false)

  function fetchCategories() {
    fetch('/api/admin/purchase-categories')
      .then(r => r.json())
      .then(data => { setCategories(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchCategories() }, [])

  function handleAdd() {
    setEditingId(null)
    setFormName('')
    setShowForm(true)
    setMessage(null)
  }

  function handleEdit(cat: any) {
    setEditingId(cat.id)
    setFormName(cat.name)
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
        ? `/api/admin/purchase-categories/${editingId}`
        : '/api/admin/purchase-categories'
      const method = editingId ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: formName.trim() }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: editingId ? 'カテゴリを更新しました' : 'カテゴリを追加しました' })
        setShowForm(false)
        setEditingId(null)
        setFormName('')
        fetchCategories()
      } else {
        setMessage({ type: 'error', text: data.error || '保存に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '保存に失敗しました' })
    }
    setSaving(false)
  }

  async function handleDelete(cat: any) {
    if (!confirm(`「${cat.name}」を削除しますか？`)) return
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/purchase-categories/${cat.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        setMessage({ type: 'success', text: 'カテゴリを削除しました' })
        fetchCategories()
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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" />
        </svg>
        <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">買取カテゴリ管理</h3>
        <span className="ml-auto text-xs text-[var(--md-sys-color-on-surface-variant)]">
          {loading ? '' : `${categories.length}件`}
        </span>
      </div>
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5 ml-8">
        買取品目に設定するカテゴリを管理します。
      </p>

      <div className="ml-8 space-y-4">
        {message && (
          <MessageBanner severity={message.type} dismissible onDismiss={() => setMessage(null)}>
            {message.text}
          </MessageBanner>
        )}

        {!loading && categories.length > 0 && (
          <div className="space-y-1">
            {categories.map((cat: any) => (
              <div key={cat.id} className="flex items-center gap-3 py-2.5 px-3 rounded-[var(--md-sys-shape-small)] hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors">
                <span className="text-sm font-medium text-[var(--md-sys-color-on-surface)] flex-1">{cat.name}</span>
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container-high)] px-2 py-0.5 rounded-full flex-shrink-0">
                  {cat._count?.purchaseItems ?? 0}件
                </span>
                <Button variant="text" size="sm" onClick={() => handleEdit(cat)}>編集</Button>
                <Button variant="text" size="sm" danger onClick={() => handleDelete(cat)}>削除</Button>
              </div>
            ))}
          </div>
        )}

        {!loading && categories.length === 0 && !showForm && (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">カテゴリがまだ登録されていません。</p>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="max-w-lg space-y-4 p-4 rounded-[var(--md-sys-shape-medium)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
            <h4 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
              {editingId ? 'カテゴリを編集' : 'カテゴリを追加'}
            </h4>
            <TextField label="カテゴリ名" value={formName} onChange={setFormName} placeholder="例: 家電、ブランド品" required />
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
