'use client'

import { useState, useEffect } from 'react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import SettingsShell from '../SettingsShell'

type WorkItemMaster = {
  id: string
  name: string
  defaultUnitPrice: number
  notes: string | null
  sortOrder: number
  isActive: boolean
}

const fmtYen = (n: number) => `¥${n.toLocaleString()}`

export default function WorkItemMastersPage() {
  return (
    <SettingsShell title="請求項目マスタ">
      <WorkItemMasterSection />
    </SettingsShell>
  )
}

function WorkItemMasterSection() {
  const [items, setItems] = useState<WorkItemMaster[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 追加フォーム
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [adding, setAdding] = useState(false)

  // インライン編集
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', defaultUnitPrice: '', notes: '' })
  const [savingEdit, setSavingEdit] = useState(false)

  // ドラッグ並び替え
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  function fetchItems() {
    fetch('/api/work-item-masters?all=1')
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
      const res = await fetch('/api/admin/work-item-masters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newName.trim(),
          defaultUnitPrice: Number(newPrice) || 0,
          notes: newNotes.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessage({ type: 'success', text: '請求項目を追加しました' })
        setNewName(''); setNewPrice(''); setNewNotes('')
        fetchItems()
      } else {
        setMessage({ type: 'error', text: data.error || '追加に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '追加に失敗しました' })
    }
    setAdding(false)
  }

  function startEdit(item: WorkItemMaster) {
    setEditingId(item.id)
    setEditForm({ name: item.name, defaultUnitPrice: String(item.defaultUnitPrice), notes: item.notes || '' })
    setMessage(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditForm({ name: '', defaultUnitPrice: '', notes: '' })
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editingId || !editForm.name.trim()) return
    setSavingEdit(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/work-item-masters/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          defaultUnitPrice: Number(editForm.defaultUnitPrice) || 0,
          notes: editForm.notes.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessage({ type: 'success', text: '請求項目を更新しました' })
        cancelEdit()
        fetchItems()
      } else {
        setMessage({ type: 'error', text: data.error || '更新に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '更新に失敗しました' })
    }
    setSavingEdit(false)
  }

  async function toggleActive(item: WorkItemMaster) {
    setMessage(null)
    setItems(prev => prev.map(i => (i.id === item.id ? { ...i, isActive: !i.isActive } : i)))
    try {
      const res = await fetch(`/api/admin/work-item-masters/${item.id}`, {
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

  async function handleDelete(item: WorkItemMaster) {
    if (!confirm(`「${item.name}」を削除しますか？`)) return
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/work-item-masters/${item.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessage({ type: 'success', text: '請求項目を削除しました' })
        fetchItems()
        return
      }
      if (res.status === 409 && data.requiresConfirm) {
        const ok = confirm(`${data.message}\n\n削除ではなく無効化を推奨します。それでも削除しますか？（既存の明細は作業名がそのまま残ります）`)
        if (!ok) return
        const forceRes = await fetch(`/api/admin/work-item-masters/${item.id}?force=1`, { method: 'DELETE' })
        const forceData = await forceRes.json().catch(() => ({}))
        if (forceRes.ok) {
          setMessage({ type: 'success', text: '請求項目を削除しました' })
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

  function persistOrder(ordered: WorkItemMaster[]) {
    fetch('/api/admin/work-item-masters/reorder', {
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
        <span className="text-lg leading-none" aria-hidden="true">🧾</span>
        <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">請求項目マスタ</h3>
        <span className="ml-auto text-xs text-[var(--md-sys-color-on-surface-variant)]">
          {loading ? '' : `${items.length}件`}
        </span>
      </div>
      <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5 ml-8">
        案件の請求項目はここに登録した項目からプルダウンで選択します。既定の単価は案件側で調整できます。
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
              ⠿ の行をドラッグして並べ替えると、案件のプルダウンの表示順に反映されます。
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
                    <form onSubmit={saveEdit} className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                          autoFocus
                          onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                          className="flex-1 min-w-0 px-2 py-1.5 text-sm rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]"
                        />
                        <input
                          type="number"
                          value={editForm.defaultUnitPrice}
                          onChange={e => setEditForm(f => ({ ...f, defaultUnitPrice: e.target.value }))}
                          placeholder="既定単価"
                          className="w-28 px-2 py-1.5 text-sm rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editForm.notes}
                          onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                          placeholder="補足（任意）"
                          className="flex-1 min-w-0 px-2 py-1.5 text-sm rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]"
                        />
                        <Button variant="filled" size="sm" type="submit" loading={savingEdit} disabled={!editForm.name.trim()}>保存</Button>
                        <Button variant="text" size="sm" type="button" onClick={cancelEdit}>キャンセル</Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        title="クリックして編集"
                        className="flex-1 min-w-0 text-left hover:underline"
                      >
                        <span className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] truncate">{item.name}</span>
                        {item.notes && (
                          <span className="block text-xs text-[var(--md-sys-color-on-surface-variant)] truncate">{item.notes}</span>
                        )}
                      </button>
                      <span className="flex-shrink-0 text-sm tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
                        {fmtYen(item.defaultUnitPrice)}
                      </span>
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
          <MessageBanner severity="info">
            請求項目がまだ登録されていません。1件も登録がない間は、案件側で作業名を自由入力できる状態のままです。
          </MessageBanner>
        )}

        <form onSubmit={handleAdd} className="max-w-2xl space-y-3">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <TextField label="新しい作業名" value={newName} onChange={setNewName} placeholder="例: 家財搬出作業、ハウスクリーニング" />
            </div>
            <div className="w-36">
              <TextField label="既定の単価（円）" type="number" value={newPrice} onChange={setNewPrice} />
            </div>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <TextField label="補足（任意）" value={newNotes} onChange={setNewNotes} placeholder="プルダウンに説明として表示されます" />
            </div>
            <Button variant="tonal" type="submit" loading={adding} disabled={!newName.trim()}>追加</Button>
          </div>
        </form>
      </div>
    </Card>
  )
}
