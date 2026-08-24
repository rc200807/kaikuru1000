'use client'

import { useState, useEffect, useMemo } from 'react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import SettingsShell from '../SettingsShell'
import { STORE_NAV_GATE_LABEL, type StoreNavGate } from '@/lib/store-nav'

type NavItemRow = {
  key: string
  label: string
  href: string
  gate: StoreNavGate | null
  locked: boolean
  visible: boolean
}

type OverrideRow = {
  storeId: string
  storeName: string
  storeCode: string
  showAll: boolean
  items: Record<string, boolean>
  note: string | null
}

type StoreOption = { id: string; name: string; code: string }

/** 特例エディタの1項目の状態: 既定に従う / 強制表示 / 強制非表示 */
type OverrideChoice = 'default' | 'show' | 'hide'

export default function StoreMenuSettingsPage() {
  return (
    <SettingsShell title="店舗メニュー設定">
      <StoreMenuSettings />
    </SettingsShell>
  )
}

function StoreMenuSettings() {
  const [items, setItems] = useState<NavItemRow[]>([])
  const [overrides, setOverrides] = useState<OverrideRow[]>([])
  const [stores, setStores] = useState<StoreOption[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 並び替え
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  // 特例エディタ
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null)
  const [editShowAll, setEditShowAll] = useState(false)
  const [editChoices, setEditChoices] = useState<Record<string, OverrideChoice>>({})
  const [editNote, setEditNote] = useState('')
  const [savingOverride, setSavingOverride] = useState(false)

  function load() {
    fetch('/api/admin/store-nav')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data) {
          setItems(Array.isArray(data.items) ? data.items : [])
          setOverrides(Array.isArray(data.overrides) ? data.overrides : [])
          setStores(Array.isArray(data.stores) ? data.stores : [])
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  async function persist(next: NavItemRow[]) {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/admin/store-nav', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order: next.map(i => i.key),
          hidden: next.filter(i => !i.visible).map(i => i.key),
        }),
      })
      if (res.ok) {
        setMessage({ type: 'success', text: 'メニュー構成を保存しました（店舗側は次回読み込み時に反映されます）' })
      } else {
        const data = await res.json().catch(() => ({}))
        setMessage({ type: 'error', text: data.error || '保存に失敗しました' })
        load()
      }
    } catch {
      setMessage({ type: 'error', text: '保存に失敗しました' })
      load()
    }
    setSaving(false)
  }

  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) { setDragIndex(null); return }
    const next = [...items]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(targetIndex, 0, moved)
    setItems(next)
    setDragIndex(null)
    persist(next)
  }

  function toggleVisible(key: string) {
    const target = items.find(i => i.key === key)
    if (!target || target.locked) return
    const next = items.map(i => (i.key === key ? { ...i, visible: !i.visible } : i))
    setItems(next)
    persist(next)
  }

  // ---- 特例 ----
  const overrideByStore = useMemo(
    () => new Map(overrides.map(o => [o.storeId, o])),
    [overrides],
  )

  function startEditOverride(storeId: string) {
    const existing = overrideByStore.get(storeId)
    const choices: Record<string, OverrideChoice> = {}
    for (const item of items) {
      const v = existing?.items?.[item.key]
      choices[item.key] = v === true ? 'show' : v === false ? 'hide' : 'default'
    }
    setEditingStoreId(storeId)
    setEditShowAll(existing?.showAll ?? false)
    setEditChoices(choices)
    setEditNote(existing?.note ?? '')
    setMessage(null)
  }

  function cancelEditOverride() {
    setEditingStoreId(null)
    setEditChoices({})
    setEditShowAll(false)
    setEditNote('')
  }

  async function saveOverride() {
    if (!editingStoreId) return
    setSavingOverride(true)
    setMessage(null)
    const itemsPayload: Record<string, boolean> = {}
    for (const [key, choice] of Object.entries(editChoices)) {
      if (choice === 'show') itemsPayload[key] = true
      else if (choice === 'hide') itemsPayload[key] = false
    }
    try {
      const res = await fetch('/api/admin/store-nav/overrides', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId: editingStoreId,
          showAll: editShowAll,
          items: itemsPayload,
          note: editNote.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessage({ type: 'success', text: '店舗の特例を保存しました' })
        cancelEditOverride()
        load()
      } else {
        setMessage({ type: 'error', text: data.error || '保存に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '保存に失敗しました' })
    }
    setSavingOverride(false)
  }

  async function deleteOverride(storeId: string, storeName: string) {
    if (!confirm(`「${storeName}」の特例を解除して共通設定に戻しますか？`)) return
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/store-nav/overrides?storeId=${encodeURIComponent(storeId)}`, {
        method: 'DELETE',
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessage({ type: 'success', text: '特例を解除しました' })
        if (editingStoreId === storeId) cancelEditOverride()
        load()
      } else {
        setMessage({ type: 'error', text: data.error || '解除に失敗しました' })
      }
    } catch {
      setMessage({ type: 'error', text: '解除に失敗しました' })
    }
  }

  const hiddenCount = items.filter(i => !i.visible).length
  const editingStore = stores.find(s => s.id === editingStoreId) ?? null

  return (
    <>
      {message && (
        <MessageBanner severity={message.type} dismissible onDismiss={() => setMessage(null)}>
          {message.text}
        </MessageBanner>
      )}

      {/* 共通設定 */}
      <Card variant="elevated" padding="md">
        <div className="flex items-center gap-3 mb-1">
          <svg className="w-5 h-5 text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">メニューの並び順・表示</h3>
          <span className="ml-auto text-xs text-[var(--md-sys-color-on-surface-variant)]">
            {loading ? '' : `${items.length}項目${hiddenCount > 0 ? ` / 非表示 ${hiddenCount}` : ''}`}
          </span>
        </div>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5 ml-8">
          店舗ポータルの左サイドメニュー（モバイルはメニュー内）の並び順と表示/非表示です。⠿ をドラッグして並べ替えると全店舗に反映されます。
        </p>

        <div className="ml-8 space-y-1">
          {loading ? (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">読み込み中...</p>
          ) : (
            items.map((item, idx) => (
              <div
                key={item.key}
                draggable
                onDragStart={() => setDragIndex(idx)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(idx)}
                onDragEnd={() => setDragIndex(null)}
                className={`flex items-center gap-3 py-2 px-3 rounded-[var(--md-sys-shape-small)] transition-colors ${
                  dragIndex === idx
                    ? 'bg-[var(--md-sys-color-surface-container-high)]'
                    : 'hover:bg-[var(--md-sys-color-surface-container-low)]'
                } ${!item.visible ? 'opacity-50' : ''}`}
              >
                <span
                  className="text-[var(--md-sys-color-on-surface-variant)] select-none flex-shrink-0 cursor-grab"
                  aria-hidden="true"
                >
                  ⠿
                </span>
                <span className="text-xs text-[var(--md-sys-color-on-surface-faint)] w-6 flex-shrink-0 tabular-nums">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)] truncate">{item.label}</p>
                  <p className="text-[11px] text-[var(--md-sys-color-on-surface-faint)] truncate">
                    {item.href}
                    {item.gate && ` ・ ${STORE_NAV_GATE_LABEL[item.gate]}`}
                  </p>
                </div>
                {item.locked ? (
                  <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">
                    常に表示
                  </span>
                ) : (
                  <>
                    {!item.visible && (
                      <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">
                        非表示
                      </span>
                    )}
                    <button
                      type="button"
                      role="switch"
                      aria-checked={item.visible}
                      aria-label={`${item.label}を${item.visible ? '非表示' : '表示'}にする`}
                      onClick={() => toggleVisible(item.key)}
                      disabled={saving}
                      title={item.visible ? '非表示にする' : '表示する'}
                      className="flex-shrink-0 relative w-10 h-6 rounded-full transition-colors"
                      style={{
                        // 管理ポータルは --md-sys-color-primary を定義していないため --portal-primary を使う
                        background: item.visible ? 'var(--portal-primary, #374151)' : 'var(--md-sys-color-surface-container-highest)',
                        border: '1px solid var(--md-sys-color-outline-variant)',
                      }}
                    >
                      <span
                        className="absolute top-0.5 rounded-full transition-all"
                        style={{
                          width: 18, height: 18, left: item.visible ? 19 : 2,
                          background: item.visible ? 'var(--portal-on-primary, #fff)' : 'var(--md-sys-color-outline)',
                        }}
                      />
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </Card>

      {/* 店舗ごとの特例 */}
      <Card variant="elevated" padding="md">
        <div className="flex items-center gap-3 mb-1">
          <svg className="w-5 h-5 text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-6m0 0V5a2 2 0 012-2h11l-1 3 1 3H5a2 2 0 00-2 2z" />
          </svg>
          <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">店舗ごとの特例</h3>
          <span className="ml-auto text-xs text-[var(--md-sys-color-on-surface-variant)]">
            {loading ? '' : `${overrides.length}店舗`}
          </span>
        </div>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5 ml-8">
          指定した店舗だけ、共通設定で非表示にしたメニューを表示できます。「すべて表示」か、項目ごとの上書きを選べます。
        </p>

        <div className="ml-8 space-y-4">
          {/* 既存の特例 */}
          {overrides.length > 0 && (
            <div className="space-y-1">
              {overrides.map(o => {
                const forced = Object.entries(o.items)
                const shown = forced.filter(([, v]) => v).length
                const hidden = forced.filter(([, v]) => !v).length
                return (
                  <div
                    key={o.storeId}
                    className="flex items-center gap-3 py-2 px-3 rounded-[var(--md-sys-shape-small)] hover:bg-[var(--md-sys-color-surface-container-low)]"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)] truncate">
                        {o.storeName}
                        <span className="ml-1.5 text-[11px] font-normal text-[var(--md-sys-color-on-surface-faint)]">{o.storeCode}</span>
                      </p>
                      <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate">
                        {o.showAll
                          ? 'すべてのメニューを表示'
                          : [shown > 0 ? `表示 ${shown}件` : null, hidden > 0 ? `非表示 ${hidden}件` : null]
                              .filter(Boolean).join(' ・ ') || '上書きなし（共通設定と同じ）'}
                        {o.note && ` ・ ${o.note}`}
                      </p>
                    </div>
                    <Button variant="text" size="sm" onClick={() => startEditOverride(o.storeId)}>編集</Button>
                    <Button variant="text" size="sm" onClick={() => deleteOverride(o.storeId, o.storeName)}>解除</Button>
                  </div>
                )
              })}
            </div>
          )}

          {/* 特例の追加 */}
          {!editingStoreId && (
            <div className="flex items-center gap-2">
              <select
                value=""
                onChange={e => { if (e.target.value) startEditOverride(e.target.value) }}
                disabled={loading}
                className="flex-1 min-w-0 px-2 py-2 text-sm rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]"
              >
                <option value="">＋ 特例を設定する店舗を選択...</option>
                {stores.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}（{s.code}）{overrideByStore.has(s.id) ? ' ※特例あり' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* エディタ */}
          {editingStoreId && (
            <div className="rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] p-3 space-y-3">
              <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                {editingStore ? `${editingStore.name}（${editingStore.code}）` : '店舗'}の特例
              </p>

              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={editShowAll}
                  onChange={e => setEditShowAll(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm text-[var(--md-sys-color-on-surface)]">
                  すべてのメニューを表示する（共通設定の非表示を無視）
                </span>
              </label>

              <div className={editShowAll ? 'opacity-40 pointer-events-none' : ''}>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-2">
                  項目ごとの上書き（「既定」は共通設定に従います）
                </p>
                <div className="space-y-1">
                  {items.filter(i => !i.locked).map(item => (
                    <div key={item.key} className="flex items-center gap-3">
                      <span className="text-sm text-[var(--md-sys-color-on-surface)] flex-1 min-w-0 truncate">
                        {item.label}
                        <span className="ml-1.5 text-[11px] text-[var(--md-sys-color-on-surface-faint)]">
                          {item.visible ? '共通: 表示' : '共通: 非表示'}
                        </span>
                      </span>
                      <select
                        value={editChoices[item.key] ?? 'default'}
                        onChange={e => setEditChoices(prev => ({ ...prev, [item.key]: e.target.value as OverrideChoice }))}
                        className="px-2 py-1 text-xs rounded-[var(--md-sys-shape-small)] border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]"
                      >
                        <option value="default">既定</option>
                        <option value="show">表示</option>
                        <option value="hide">非表示</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <TextField label="メモ（任意）" value={editNote} onChange={setEditNote} placeholder="例: 試験導入のため案件のみ表示" />

              <div className="flex items-center gap-2">
                <Button variant="filled" size="sm" onClick={saveOverride} loading={savingOverride}>保存</Button>
                <Button variant="text" size="sm" onClick={cancelEditOverride}>キャンセル</Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </>
  )
}
