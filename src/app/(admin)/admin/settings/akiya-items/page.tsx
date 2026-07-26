'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import SettingsShell from '../SettingsShell'

type AkiyaItem = {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
}

export default function AkiyaItemsPage() {
  return (
    <SettingsShell title="空き家管理項目">
      <AkiyaItemSection />
    </SettingsShell>
  )
}

function AkiyaItemSection() {
  const [items, setItems] = useState<AkiyaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 追加フォーム
  const [newName, setNewName] = useState('')
  const [adding, setAdding] = useState(false)

  // インライン編集
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

  // ドラッグ並び替え
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  function fetchItems() {
    fetch('/api/akiya-management-items')
      .then(r => r.json())
      .then(data => { setItems(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { fetchItems() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    setAdding(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/akiya-management-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessage({ type: 'success', text: '項目を追加しました' })
        setNewName('')
        fetchItems()
      } else {
        setMessage({ type: 'error', text: data.error || '追加に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '追加に失敗しました' })
    }
    setAdding(false)
  }

  function startEdit(item: AkiyaItem) {
    setEditingId(item.id)
    setEditName(item.name)
    setMessage(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditName('')
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId || !editName.trim()) return
    setSavingEdit(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/akiya-management-items/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessage({ type: 'success', text: '項目名を更新しました' })
        setEditingId(null)
        setEditName('')
        fetchItems()
      } else {
        setMessage({ type: 'error', text: data.error || '更新に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '更新に失敗しました' })
    }
    setSavingEdit(false)
  }

  async function toggleActive(item: AkiyaItem) {
    setMessage(null)
    // 楽観的更新
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, isActive: !i.isActive } : i)))
    try {
      const res = await fetch(`/api/admin/akiya-management-items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !item.isActive }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setMessage({ type: 'error', text: data.error || '更新に失敗しました' })
        fetchItems()
      }
    } catch {
      setMessage({ type: 'error', text: '更新に失敗しました' })
      fetchItems()
    }
  }

  async function handleDelete(item: AkiyaItem) {
    if (!confirm(`「${item.name}」を削除しますか？`)) return
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/akiya-management-items/${item.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessage({ type: 'success', text: '項目を削除しました' })
        fetchItems()
        return
      }
      if (res.status === 409 && data.requiresConfirm) {
        const ok = confirm(`${data.message}\n\n削除ではなく無効化を推奨します。それでも削除しますか？`)
        if (!ok) return
        const forceRes = await fetch(`/api/admin/akiya-management-items/${item.id}?force=1`, { method: 'DELETE' })
        const forceData = await forceRes.json().catch(() => ({}))
        if (forceRes.ok) {
          setMessage({ type: 'success', text: '項目を削除しました' })
          fetchItems()
        } else {
          setMessage({ type: 'error', text: forceData.error || '削除に失敗しました' })
        }
        return
      }
      setMessage({ type: 'error', text: data.error || '削除に失敗しました' })
    } catch {
      setMessage({ type: 'error', text: '削除に失敗しました' })
    }
  }

  function persistOrder(ordered: AkiyaItem[]) {
    fetch('/api/admin/akiya-management-items/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ordered.map(i => i.id) }),
    }).catch(() => {})
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) { setDragIndex(null); return }
    setItems(prev => {
      const next = [...prev]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(targetIndex, 0, moved)
      persistOrder(next)
      return next
    })
    setDragIndex(null)
  }

  return (
    <Card variant="elevated" padding="md">
      <div className="flex items-center gap-3 mb-1">
        <svg className="w-5 h-5 text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">空き家管理項目</h3>
        <span className="ml-auto text-xs text-[var(--md-sys-color-on-surface-variant)]">
          {loading ? '' : `${items.length}件`}
        </span>
      </div>
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5 ml-8">
        空き家管理記録の点検項目マスタです。ここでの並び順が記録入力フォームの表示順になります。
      </p>

      <div className="ml-8 space-y-4">
        {message && (
          <MessageBanner severity={message.type} dismissible onDismiss={() => setMessage(null)}>
            {message.text}
          </MessageBanner>
        )}

        {!loading && items.length > 0 && (
          <>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              ⠿ の行をドラッグして並べ替えると、記録入力フォームの表示順に反映されます。
            </p>
            <div className="space-y-1">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  draggable={editingId === null}
                  onDragStart={() => editingId === null && setDragIndex(idx)}
                  onDragOver={e => { if (editingId === null) e.preventDefault() }}
                  onDrop={() => editingId === null && handleDrop(idx)}
                  onDragEnd={() => setDragIndex(null)}
                  className={`flex items-center gap-3 py-2 px-3 rounded-[var(--md-sys-shape-small)] transition-colors ${
                    dragIndex === idx
                      ? 'bg-[var(--md-sys-color-surface-container-high)]'
                      : 'hover:bg-[var(--md-sys-color-surface-container-low)]'
                  } ${!item.isActive ? 'opacity-50' : ''}`}
                >
                  <span
                    className="text-[var(--md-sys-color-on-surface-variant)] select-none flex-shrink-0"
                    style={{ cursor: editingId === null ? 'grab' : 'default' }}
                    aria-hidden="true"
                  >
                    ⠿
                  </span>

                  {editingId === item.id ? (
                    <form onSubmit={saveEdit} className="flex items-center gap-2 flex-1 min-w-0">
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        autoFocus
                        onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                        className="flex-1 min-w-0 px-2 py-1.5 text-sm rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]"
                      />
                      <Button variant="filled" size="sm" type="submit" loading={savingEdit} disabled={!editName.trim()}>保存</Button>
                      <Button variant="text" size="sm" type="button" onClick={cancelEdit}>キャンセル</Button>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        title="クリックして名称を編集"
                        className="text-sm font-medium text-[var(--md-sys-color-on-surface)] flex-1 min-w-0 text-left truncate hover:underline"
                      >
                        {item.name}
                      </button>
                      {!item.isActive && (
                        <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">
                          無効
                        </span>
                      )}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={item.isActive}
                        onClick={() => toggleActive(item)}
                        title={item.isActive ? '無効にする' : '有効にする'}
                        className="flex-shrink-0 relative w-10 h-6 rounded-full transition-colors"
                        style={{ background: item.isActive ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-surface-container-highest)', border: '1px solid var(--md-sys-color-outline-variant)' }}
                      >
                        <span
                          className="absolute top-0.5 rounded-full transition-all"
                          style={{
                            width: 18,
                            height: 18,
                            left: item.isActive ? 19 : 2,
                            background: item.isActive ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-outline)',
                          }}
                        />
                      </button>
                      <Button variant="text" size="sm" danger onClick={() => handleDelete(item)}>削除</Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {!loading && items.length === 0 && (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">管理項目がまだ登録されていません。</p>
        )}

        <form onSubmit={handleAdd} className="max-w-lg flex items-end gap-3">
          <div className="flex-1">
            <TextField label="新しい項目名" value={newName} onChange={setNewName} placeholder="例: 建物外観、郵便受け、庭木・雑草" />
          </div>
          <Button variant="tonal" type="submit" loading={adding} disabled={!newName.trim()}>追加</Button>
        </form>
      </div>
    </Card>
  )
}
