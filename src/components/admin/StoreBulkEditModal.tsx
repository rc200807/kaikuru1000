'use client'

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import { PREFECTURES } from '@/lib/prefectures'
import BulkEditCell, { type CellEditorType } from './BulkEditCell'

// グリッドで扱う店舗の形（親ページの Store 型のサブセット。構造的型付けでそのまま渡せる）
export type BulkStore = {
  id: string
  code: string
  name: string
  storeStatus: string | null
  postalCode: string | null
  prefecture: string | null
  address: string | null
  phone: string | null
  email: string | null
  openingDate: string | null
  closingDate: string | null
  googleBusinessUrl: string | null
  oikuraPageUrl: string | null
  lineAddFriendUrl: string | null
  bankName: string | null
  branchName: string | null
  accountType: string | null
  accountNumber: string | null
  accountHolder: string | null
  invoiceNumber: string | null
  antiquePermitNumber: string | null
  contractNotifyEmail: string | null
  calendarInviteEmail: string | null
}

type ColumnDef = {
  key: keyof BulkStore & string
  label: string
  editor: CellEditorType
  options?: { value: string; label: string }[]
  width: number
  readOnly?: boolean
}

// 列定義。key は PATCH /api/admin/stores/[id] updateDetails のホワイトリストと一致させること
const COLUMNS: ColumnDef[] = [
  { key: 'code', label: 'コード', editor: 'text', width: 96, readOnly: true },
  { key: 'name', label: '店舗名', editor: 'text', width: 180 },
  {
    key: 'storeStatus', label: 'ステータス', editor: 'select', width: 110,
    options: [
      { value: 'active', label: '営業中' },
      { value: 'closed', label: '閉店' },
    ],
  },
  { key: 'postalCode', label: '郵便番号', editor: 'postal', width: 110 },
  {
    key: 'prefecture', label: '都道府県', editor: 'select', width: 110,
    options: [
      { value: '', label: '（未設定）' },
      ...PREFECTURES.map(p => ({ value: p, label: p })),
    ],
  },
  { key: 'address', label: '住所', editor: 'text', width: 260 },
  { key: 'phone', label: '電話番号', editor: 'text', width: 130 },
  { key: 'email', label: 'メールアドレス', editor: 'text', width: 200 },
  { key: 'openingDate', label: '開業日', editor: 'date', width: 140 },
  { key: 'closingDate', label: '閉店日', editor: 'date', width: 140 },
  { key: 'googleBusinessUrl', label: 'GoogleビジネスURL', editor: 'text', width: 220 },
  { key: 'oikuraPageUrl', label: 'おいくらURL', editor: 'text', width: 220 },
  { key: 'lineAddFriendUrl', label: 'LINE友達登録URL', editor: 'text', width: 220 },
  { key: 'bankName', label: '銀行名', editor: 'text', width: 140 },
  { key: 'branchName', label: '支店名', editor: 'text', width: 140 },
  {
    key: 'accountType', label: '口座種別', editor: 'select', width: 100,
    options: [
      { value: '', label: '（未設定）' },
      { value: '普通', label: '普通' },
      { value: '当座', label: '当座' },
    ],
  },
  { key: 'accountNumber', label: '口座番号', editor: 'text', width: 110 },
  { key: 'accountHolder', label: '口座名義', editor: 'text', width: 150 },
  { key: 'invoiceNumber', label: 'インボイス番号', editor: 'text', width: 160 },
  { key: 'antiquePermitNumber', label: '古物許可番号', editor: 'text', width: 160 },
  { key: 'contractNotifyEmail', label: '契約通知メール', editor: 'text', width: 200 },
  { key: 'calendarInviteEmail', label: 'カレンダー招待メール', editor: 'text', width: 200 },
]

const DATE_KEYS = new Set(['openingDate', 'closingDate'])

// 比較・表示用の正規化: 日付は YYYY-MM-DD、null/undefined は ''
function normalize(key: string, raw: unknown): string {
  if (raw == null) return ''
  const s = String(raw)
  return DATE_KEYS.has(key) ? s.slice(0, 10) : s
}

type DirtyMap = Record<string, Record<string, string>>
type PresenceEntry = { adminId: string; adminName: string; storeId: string | null }
type RowFlash = 'saved' | 'error'

// ─────────────────────────────────────────────
// 行コンポーネント（memo でセル編集時の全行再レンダリングを防止）
// ─────────────────────────────────────────────
type GridRowProps = {
  store: BulkStore
  rowDirty: Record<string, string> | undefined
  editingField: string | null
  presenceNames: string[] | undefined
  saving: boolean
  flash: RowFlash | undefined
  onStartEdit: (storeId: string, field: string) => void
  onEndEdit: () => void
  onCommit: (storeId: string, changes: Record<string, string>) => void
  onRevert: (storeId: string, field: string) => void
  onSaveRow: (storeId: string) => void
}

const GridRow = memo(function GridRow({
  store, rowDirty, editingField, presenceNames, saving, flash,
  onStartEdit, onEndEdit, onCommit, onRevert, onSaveRow,
}: GridRowProps) {
  const dirtyCount = rowDirty ? Object.keys(rowDirty).length : 0

  return (
    <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
      {COLUMNS.map(col => {
        const original = normalize(col.key, store[col.key])
        const value = rowDirty?.[col.key] ?? original
        const cell = (
          <BulkEditCell
            storeId={store.id}
            field={col.key}
            editor={col.editor}
            options={col.options}
            value={value}
            dirty={rowDirty ? col.key in rowDirty : false}
            editing={editingField === col.key}
            readOnly={col.readOnly}
            onStartEdit={onStartEdit}
            onEndEdit={onEndEdit}
            onCommit={onCommit}
            onRevert={onRevert}
          />
        )
        if (col.key === 'code') {
          return (
            <td
              key={col.key}
              className="sticky left-0 z-10 bg-[var(--md-sys-color-surface-container-lowest,#fff)] px-1 py-1 border-r border-[var(--md-sys-color-outline-variant)]"
            >
              <div className="font-mono text-xs">{cell}</div>
            </td>
          )
        }
        return (
          <td key={col.key} className="px-1 py-1">
            {cell}
          </td>
        )
      })}

      {/* アクション列（sticky 右端）: 変更あり・保存・他ユーザー編集中 */}
      <td className="sticky right-0 z-10 bg-[var(--md-sys-color-surface-container-lowest,#fff)] px-2 py-1 border-l border-[var(--md-sys-color-outline-variant)]">
        <div className="flex items-center gap-2 min-h-8">
          {presenceNames && presenceNames.length > 0 && (
            <span
              title={`${presenceNames.join('、')}さんがこの店舗を編集中です`}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              {presenceNames[0]}{presenceNames.length > 1 ? ` 他${presenceNames.length - 1}名` : ''}が編集中
            </span>
          )}
          {flash === 'saved' && (
            <span className="inline-flex items-center gap-1 text-xs text-[var(--status-completed-text,#1a7f37)] whitespace-nowrap">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              保存しました
            </span>
          )}
          {flash === 'error' && (
            <span className="text-xs text-[var(--md-sys-color-error)] whitespace-nowrap">保存に失敗</span>
          )}
          {dirtyCount > 0 && (
            <>
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[var(--md-sys-color-tertiary-container,#fde68a)] text-[var(--md-sys-color-on-tertiary-container,#78350f)] whitespace-nowrap">
                変更あり（{dirtyCount}項目）
              </span>
              <button
                type="button"
                disabled={saving}
                onClick={() => onSaveRow(store.id)}
                className="inline-flex items-center gap-1 text-xs font-medium px-3 h-7 rounded-full bg-[var(--portal-primary,#374151)] text-[var(--portal-on-primary,#fff)] hover:opacity-90 disabled:opacity-50 whitespace-nowrap transition-opacity"
              >
                {saving ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {saving ? '保存中' : '変更を保存'}
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  )
})

// ─────────────────────────────────────────────
// モーダル本体
// ─────────────────────────────────────────────
type Props = {
  open: boolean
  stores: BulkStore[]
  onClose: () => void
}

export default function StoreBulkEditModal({ open, stores, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  // グリッドのローカルデータ（保存成功時にAPIレスポンスで更新）
  const [rows, setRows] = useState<BulkStore[]>([])
  const [dirty, setDirty] = useState<DirtyMap>({})
  const [editingCell, setEditingCell] = useState<{ storeId: string; field: string } | null>(null)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [rowFlash, setRowFlash] = useState<Record<string, RowFlash>>({})
  const [others, setOthers] = useState<PresenceEntry[]>([])
  const [banner, setBanner] = useState<string | null>(null)

  const rowsRef = useRef<BulkStore[]>([])
  rowsRef.current = rows
  const dirtyRef = useRef<DirtyMap>({})
  dirtyRef.current = dirty
  const editingRef = useRef(editingCell)
  editingRef.current = editingCell

  // open のたびにデータをリセット
  useEffect(() => {
    if (open) {
      setRows(stores)
      setDirty({})
      setEditingCell(null)
      setSavingIds(new Set())
      setRowFlash({})
      setOthers([])
      setBanner(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // <dialog> の open 状態同期（Modal.tsx のパターンを踏襲）
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  const dirtyStoreCount = Object.keys(dirty).length

  // 閉じる操作（未保存の変更があれば確認）
  const attemptClose = useCallback(() => {
    const n = Object.keys(dirtyRef.current).length
    if (n > 0 && !window.confirm(`未保存の変更が${n}店舗分あります。破棄して閉じますか？`)) {
      return
    }
    // 退室（ベストエフォート）
    fetch('/api/admin/stores/presence', { method: 'DELETE', keepalive: true }).catch(() => {})
    onClose()
  }, [onClose])

  // Esc（dialog の cancel イベント）
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handler = (e: Event) => {
      e.preventDefault()
      attemptClose()
    }
    dialog.addEventListener('cancel', handler)
    return () => dialog.removeEventListener('cancel', handler)
  }, [attemptClose])

  // body スクロールロック
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  // タブを閉じる時の警告（未保存変更がある間のみ）
  useEffect(() => {
    if (!open || dirtyStoreCount === 0) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [open, dirtyStoreCount])

  // プレゼンスのハートビート（10秒間隔、非表示タブはスキップ）
  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function beat() {
      if (document.hidden) return
      const storeIds = Array.from(new Set([
        ...Object.keys(dirtyRef.current),
        ...(editingRef.current ? [editingRef.current.storeId] : []),
      ]))
      try {
        const res = await fetch('/api/admin/stores/presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeIds }),
        })
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (!cancelled) setOthers(Array.isArray(data.others) ? data.others : [])
      } catch { /* ネットワークエラーは次回ハートビートで回復 */ }
    }
    beat()
    const timer = setInterval(beat, 10_000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [open])

  // 他ユーザーのプレゼンス（行別 / モーダル全体）
  const { rowPresence, otherNames } = useMemo(() => {
    const rowPresence = new Map<string, string[]>()
    const names = new Set<string>()
    for (const o of others) {
      names.add(o.adminName)
      if (o.storeId) {
        const list = rowPresence.get(o.storeId) ?? []
        if (!list.includes(o.adminName)) list.push(o.adminName)
        rowPresence.set(o.storeId, list)
      }
    }
    return { rowPresence, otherNames: Array.from(names) }
  }, [others])

  // セル編集コールバック（memo 行に渡すため安定化）
  const handleStartEdit = useCallback((storeId: string, field: string) => {
    setEditingCell({ storeId, field })
  }, [])

  const handleEndEdit = useCallback(() => {
    setEditingCell(null)
  }, [])

  const handleCommit = useCallback((storeId: string, changes: Record<string, string>) => {
    const store = rowsRef.current.find(r => r.id === storeId)
    if (!store) return
    setDirty(prev => {
      const row = { ...(prev[storeId] ?? {}) }
      for (const [field, value] of Object.entries(changes)) {
        const original = normalize(field, store[field as keyof BulkStore])
        if (value === original) {
          delete row[field] // 元値に戻したら dirty 解除
        } else {
          row[field] = value
        }
      }
      const next = { ...prev }
      if (Object.keys(row).length === 0) delete next[storeId]
      else next[storeId] = row
      return next
    })
  }, [])

  const handleRevert = useCallback((storeId: string, field: string) => {
    setDirty(prev => {
      const row = { ...(prev[storeId] ?? {}) }
      delete row[field]
      const next = { ...prev }
      if (Object.keys(row).length === 0) delete next[storeId]
      else next[storeId] = row
      return next
    })
  }, [])

  // 店舗単位の保存（既存の単体更新APIの部分更新をそのまま利用）
  const handleSaveRow = useCallback(async (storeId: string) => {
    const changes = dirtyRef.current[storeId]
    if (!changes || Object.keys(changes).length === 0) return
    setSavingIds(prev => new Set(prev).add(storeId))
    setBanner(null)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updateDetails: true, ...changes }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '保存に失敗しました')
      }
      const updated = await res.json()
      // ローカル行を更新（レスポンスの店舗オブジェクトをマージ）
      setRows(prev => prev.map(r => (r.id === storeId ? { ...r, ...updated } : r)))
      setDirty(prev => {
        const next = { ...prev }
        delete next[storeId]
        return next
      })
      setRowFlash(prev => ({ ...prev, [storeId]: 'saved' }))
      setTimeout(() => {
        setRowFlash(prev => {
          const next = { ...prev }
          if (next[storeId] === 'saved') delete next[storeId]
          return next
        })
      }, 2500)
    } catch (err) {
      setRowFlash(prev => ({ ...prev, [storeId]: 'error' }))
      setBanner(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSavingIds(prev => {
        const next = new Set(prev)
        next.delete(storeId)
        return next
      })
    }
  }, [])

  const handleDiscardAll = useCallback(() => {
    const n = Object.keys(dirtyRef.current).length
    if (n === 0) return
    if (window.confirm(`${n}店舗分の未保存の変更をすべて破棄しますか？`)) {
      setDirty({})
      setEditingCell(null)
    }
  }, [])

  if (!open) return null

  const totalWidth = COLUMNS.reduce((sum, c) => sum + c.width, 0) + 240 // +アクション列

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 m-0 p-0 w-full h-full max-w-none max-h-none bg-transparent backdrop:bg-[var(--md-sys-color-scrim)]/50"
    >
      <div className="w-full h-full bg-[var(--md-sys-color-surface-container-lowest,#fff)] flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)]">
          <div className="flex items-center gap-4 min-w-0">
            <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)] whitespace-nowrap">
              店舗情報の一括編集
            </h2>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] hidden sm:block">
              セルをダブルクリックで編集 → 行ごとに「変更を保存」で反映
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {otherNames.length > 0 && (
              <span
                title={`${otherNames.join('、')}さんもこの画面を開いています`}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 whitespace-nowrap"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                {otherNames.join('、')}さんも編集中
              </span>
            )}
            <button
              type="button"
              onClick={attemptClose}
              className="p-2 rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
              aria-label="閉じる"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* エラーバナー */}
        {banner && (
          <div className="px-5 py-2 bg-[var(--md-sys-color-error-container)] text-[var(--md-sys-color-on-error-container)] text-sm flex items-center justify-between">
            <span>{banner}</span>
            <button type="button" onClick={() => setBanner(null)} className="p-1 hover:opacity-70" aria-label="閉じる">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* グリッド */}
        <div className="flex-1 overflow-auto">
          <table className="text-sm border-collapse table-fixed" style={{ minWidth: totalWidth }}>
            <colgroup>
              {COLUMNS.map(col => (
                <col key={col.key} style={{ width: col.width }} />
              ))}
              <col style={{ width: 240 }} />
            </colgroup>
            <thead>
              <tr>
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className={`sticky top-0 px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container)] border-b border-[var(--md-sys-color-outline-variant)] ${
                      col.key === 'code' ? 'left-0 z-30 border-r' : 'z-20'
                    }`}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="sticky top-0 right-0 z-30 px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container)] border-b border-l border-[var(--md-sys-color-outline-variant)]">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(store => (
                <GridRow
                  key={store.id}
                  store={store}
                  rowDirty={dirty[store.id]}
                  editingField={editingCell?.storeId === store.id ? editingCell.field : null}
                  presenceNames={rowPresence.get(store.id)}
                  saving={savingIds.has(store.id)}
                  flash={rowFlash[store.id]}
                  onStartEdit={handleStartEdit}
                  onEndEdit={handleEndEdit}
                  onCommit={handleCommit}
                  onRevert={handleRevert}
                  onSaveRow={handleSaveRow}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)]">
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            {rows.length}店舗
            {dirtyStoreCount > 0 && (
              <span className="ml-3 font-medium text-[var(--md-sys-color-on-surface)]">
                {dirtyStoreCount}店舗に未保存の変更があります
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {dirtyStoreCount > 0 && (
              <button
                type="button"
                onClick={handleDiscardAll}
                className="text-xs font-medium px-4 h-9 rounded-full text-[var(--md-sys-color-error)] hover:bg-[var(--md-sys-color-error-container)] transition-colors"
              >
                すべての変更を破棄
              </button>
            )}
            <button
              type="button"
              onClick={attemptClose}
              className="text-xs font-medium px-5 h-9 rounded-full border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </dialog>
  )
}
