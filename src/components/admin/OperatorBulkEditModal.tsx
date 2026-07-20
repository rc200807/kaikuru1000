'use client'

import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { CORPORATE_PREFIXES } from '@/lib/operator-utils'
import BulkEditCell, { type CellEditorType } from './BulkEditCell'

// グリッドで扱う運営者の形。invoiceRegistered は 'true' / 'false' 文字列でセル表示する
export type BulkOperator = {
  id: string
  entityType: string
  corporatePrefix: string | null
  name: string
  representativeName: string
  representativeNameKana: string | null
  address: string | null
  phone: string | null
  email: string | null
  corporateNumber: string | null
  invoiceRegistered: string // 'true' | 'false'
  invoiceNumber: string | null
  antiquePermitNumber: string | null
  antiqueOfficeAddress: string | null
  antiqueLicenseHolder: string | null
  publicSafetyCommission: string | null
  bankName: string | null
  branchName: string | null
  accountType: string | null
  accountNumber: string | null
  accountHolder: string | null
  storeCount: number
  storeIds: string[]
}

type ColumnDef = {
  key: keyof BulkOperator & string
  label: string
  editor: CellEditorType
  options?: { value: string; label: string }[]
  width: number
}

const ENTITY_OPTIONS = [
  { value: 'corporation', label: '法人' },
  { value: 'sole_proprietor', label: '個人事業主' },
]
const PREFIX_OPTIONS = [{ value: '', label: '（なし）' }, ...CORPORATE_PREFIXES.map(p => ({ value: p, label: p }))]
const INVOICE_OPTIONS = [{ value: 'false', label: '未登録' }, { value: 'true', label: '登録済' }]
const ACCOUNT_TYPE_OPTIONS = [{ value: '', label: '（未設定）' }, { value: '普通', label: '普通' }, { value: '当座', label: '当座' }]

// 列定義。key は POST/PATCH /api/admin/operators のホワイトリストと一致させること。左固定は正式名称列
const COLUMNS: ColumnDef[] = [
  { key: 'name', label: '正式名称・屋号', editor: 'text', width: 200 },
  { key: 'entityType', label: '会社形態', editor: 'select', width: 120, options: ENTITY_OPTIONS },
  { key: 'corporatePrefix', label: '法人種別', editor: 'select', width: 120, options: PREFIX_OPTIONS },
  { key: 'representativeName', label: '代表者氏名', editor: 'text', width: 140 },
  { key: 'representativeNameKana', label: '代表者フリガナ', editor: 'text', width: 150 },
  { key: 'address', label: '所在地', editor: 'text', width: 240 },
  { key: 'phone', label: '電話番号', editor: 'text', width: 130 },
  { key: 'email', label: 'メールアドレス', editor: 'text', width: 200 },
  { key: 'corporateNumber', label: '法人番号', editor: 'text', width: 140 },
  { key: 'invoiceRegistered', label: 'インボイス登録', editor: 'select', width: 120, options: INVOICE_OPTIONS },
  { key: 'invoiceNumber', label: 'インボイス番号', editor: 'text', width: 160 },
  { key: 'antiquePermitNumber', label: '古物許可番号', editor: 'text', width: 160 },
  { key: 'antiqueOfficeAddress', label: '古物営業所住所', editor: 'text', width: 200 },
  { key: 'antiqueLicenseHolder', label: '古物届出名義', editor: 'text', width: 150 },
  { key: 'publicSafetyCommission', label: '管轄公安委員会', editor: 'text', width: 160 },
  { key: 'bankName', label: '銀行名', editor: 'text', width: 140 },
  { key: 'branchName', label: '支店名', editor: 'text', width: 140 },
  { key: 'accountType', label: '口座種別', editor: 'select', width: 100, options: ACCOUNT_TYPE_OPTIONS },
  { key: 'accountNumber', label: '口座番号', editor: 'text', width: 110 },
  { key: 'accountHolder', label: '口座名義', editor: 'text', width: 150 },
  // 運営店舗は専用の店舗選択モーダルで編集するため GridRow で特別扱いする
  { key: 'storeIds', label: '運営店舗', editor: 'text', width: 180 },
]

// 運営者が「正」となり店舗へ継承される項目（フッターの案内に使用）
const INHERITED_LABELS = '銀行口座情報・古物許可番号・インボイス番号'

const DRAFT_PREFIX = '__new_'
const isDraft = (id: string) => id.startsWith(DRAFT_PREFIX)

function normalize(raw: unknown): string {
  if (raw == null) return ''
  return String(raw)
}

function makeDraftRow(id: string): BulkOperator {
  return {
    id, entityType: 'corporation', corporatePrefix: '株式会社', name: '',
    representativeName: '', representativeNameKana: null, address: null, phone: null, email: null,
    corporateNumber: null, invoiceRegistered: 'false', invoiceNumber: null,
    antiquePermitNumber: null, antiqueOfficeAddress: null, antiqueLicenseHolder: null, publicSafetyCommission: null,
    bankName: null, branchName: null, accountType: null, accountNumber: null, accountHolder: null,
    storeCount: 0, storeIds: [],
  }
}

// APIレスポンスの運営者オブジェクトを BulkOperator 形に正規化
export function toBulkOperator(o: Record<string, any>): BulkOperator {
  return {
    id: o.id,
    entityType: o.entityType ?? 'corporation',
    corporatePrefix: o.corporatePrefix ?? null,
    name: o.name ?? '',
    representativeName: o.representativeName ?? '',
    representativeNameKana: o.representativeNameKana ?? null,
    address: o.address ?? null,
    phone: o.phone ?? null,
    email: o.email ?? null,
    corporateNumber: o.corporateNumber ?? null,
    invoiceRegistered: o.invoiceRegistered ? 'true' : 'false',
    invoiceNumber: o.invoiceNumber ?? null,
    antiquePermitNumber: o.antiquePermitNumber ?? null,
    antiqueOfficeAddress: o.antiqueOfficeAddress ?? null,
    antiqueLicenseHolder: o.antiqueLicenseHolder ?? null,
    publicSafetyCommission: o.publicSafetyCommission ?? null,
    bankName: o.bankName ?? null,
    branchName: o.branchName ?? null,
    accountType: o.accountType ?? null,
    accountNumber: o.accountNumber ?? null,
    accountHolder: o.accountHolder ?? null,
    storeCount: typeof o._count?.stores === 'number' ? o._count.stores : (o.storeCount ?? 0),
    storeIds: Array.isArray(o.stores)
      ? o.stores.map((s: any) => s.id).filter((v: unknown): v is string => typeof v === 'string')
      : (Array.isArray(o.storeIds) ? o.storeIds : []),
  }
}

type DirtyMap = Record<string, Record<string, string>>
type RowFlash = 'saved' | 'error'

// 継承項目（この運営者を編集すると紐づく全店舗へ反映される）
const INHERITED_KEYS = new Set<string>([
  'bankName', 'branchName', 'accountType', 'accountNumber', 'accountHolder',
  'antiquePermitNumber', 'invoiceNumber',
])

// changes（グリッドの差分）を API 送信用ペイロードに変換。必須欠落時は error を返す
function buildPayload(row: BulkOperator, changes: Record<string, string>): { payload: Record<string, unknown>; error?: string } {
  const payload: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(changes)) {
    const v = raw.trim()
    if (key === 'invoiceRegistered') {
      payload[key] = v === 'true'
    } else if (key === 'entityType') {
      payload[key] = v || 'corporation'
    } else if (key === 'name' || key === 'representativeName') {
      if (!v) return { payload, error: key === 'name' ? '正式名称・屋号は必須です' : '代表者氏名は必須です' }
      payload[key] = v
    } else {
      payload[key] = v === '' ? null : v
    }
  }
  return { payload }
}

// ─────────────────────────────────────────────
// 行コンポーネント
// ─────────────────────────────────────────────
type GridRowProps = {
  operator: BulkOperator
  draft: boolean
  rowDirty: Record<string, string> | undefined
  editingField: string | null
  saving: boolean
  flash: RowFlash | undefined
  onStartEdit: (id: string, field: string) => void
  onEndEdit: () => void
  onCommit: (id: string, changes: Record<string, string>) => void
  onRevert: (id: string, field: string) => void
  onSaveRow: (id: string) => void
  onCreateRow: (id: string) => void
  onDiscardDraft: (id: string) => void
  onEditStores: (id: string) => void
}

const GridRow = memo(function GridRow({
  operator, draft, rowDirty, editingField, saving, flash,
  onStartEdit, onEndEdit, onCommit, onRevert, onSaveRow, onCreateRow, onDiscardDraft, onEditStores,
}: GridRowProps) {
  const dirtyCount = rowDirty ? Object.keys(rowDirty).length : 0
  const nameValue = (rowDirty?.name ?? normalize(operator.name)).trim()
  const canCreate = nameValue !== ''

  // 個人事業主のときは法人種別を無効化
  const entityTypeValue = rowDirty?.entityType ?? normalize(operator.entityType)
  const isSoleProprietor = entityTypeValue === 'sole_proprietor'

  return (
    <tr className={`border-b border-[var(--md-sys-color-outline-variant)] ${draft ? 'bg-[var(--md-sys-color-primary-container,#e0e7ff)]/30' : ''}`}>
      {COLUMNS.map(col => {
        // 運営店舗は専用モーダルで編集（選択数を表示＋ボタン）
        if (col.key === 'storeIds') {
          if (draft) {
            return (
              <td key={col.key} className="px-1 py-1">
                <span className="block text-xs px-2 h-8 leading-8 text-[var(--md-sys-color-on-surface-variant)] truncate" title="運営者を作成した後に選択できます">
                  作成後に選択
                </span>
              </td>
            )
          }
          const isDirty = rowDirty ? 'storeIds' in rowDirty : false
          const count = isDirty
            ? (JSON.parse(rowDirty!.storeIds || '[]') as string[]).length
            : operator.storeIds.length
          return (
            <td key={col.key} className="px-1 py-1">
              <button
                type="button"
                onClick={() => onEditStores(operator.id)}
                className={`w-full text-left text-xs px-2 h-8 rounded-md border truncate transition-colors ${
                  isDirty
                    ? 'border-[var(--md-sys-color-tertiary,#b45309)] bg-[var(--md-sys-color-tertiary-container,#fef3c7)]/40'
                    : 'border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                } text-[var(--md-sys-color-on-surface)]`}
                title="運営店舗を選択"
              >
                {count > 0 ? `${count}店舗` : <span className="text-[var(--md-sys-color-on-surface-variant)]">店舗を選択</span>}
              </button>
            </td>
          )
        }
        const original = normalize(operator[col.key])
        const value = rowDirty?.[col.key] ?? original
        const prefixLocked = col.key === 'corporatePrefix' && isSoleProprietor
        const cell = (
          <BulkEditCell
            storeId={operator.id}
            field={col.key}
            editor={col.editor}
            options={col.options}
            value={prefixLocked ? '' : value}
            dirty={rowDirty ? col.key in rowDirty : false}
            editing={editingField === col.key}
            readOnly={prefixLocked}
            onStartEdit={onStartEdit}
            onEndEdit={onEndEdit}
            onCommit={onCommit}
            onRevert={onRevert}
          />
        )
        if (col.key === 'name') {
          return (
            <td
              key={col.key}
              className={`sticky left-0 z-10 px-1 py-1 border-r border-[var(--md-sys-color-outline-variant)] ${draft ? 'bg-[var(--md-sys-color-primary-container,#eef2ff)]' : 'bg-[var(--md-sys-color-surface-container-lowest,#fff)]'}`}
            >
              <div className="flex items-center gap-1">
                {draft && (
                  <span className="flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--portal-primary,#374151)] text-[var(--portal-on-primary,#fff)]">新規</span>
                )}
                <div className="flex-1 min-w-0">{cell}</div>
              </div>
            </td>
          )
        }
        return (
          <td
            key={col.key}
            className="px-1 py-1"
            title={INHERITED_KEYS.has(col.key) ? 'この項目を保存すると、紐づく全店舗へ自動反映されます' : undefined}
          >
            {cell}
          </td>
        )
      })}

      {/* アクション列（sticky 右端） */}
      <td className={`sticky right-0 z-10 px-2 py-1 border-l border-[var(--md-sys-color-outline-variant)] ${draft ? 'bg-[var(--md-sys-color-primary-container,#eef2ff)]' : 'bg-[var(--md-sys-color-surface-container-lowest,#fff)]'}`}>
        <div className="flex items-center gap-2 min-h-8">
          {draft ? (
            <>
              {flash === 'error' && (
                <span className="text-xs text-[var(--md-sys-color-error)] whitespace-nowrap">作成に失敗</span>
              )}
              <button
                type="button"
                disabled={saving || !canCreate}
                title={canCreate ? undefined : '正式名称・屋号を入力してください'}
                onClick={() => onCreateRow(operator.id)}
                className="inline-flex items-center gap-1 text-xs font-medium px-3 h-7 rounded-full bg-[var(--portal-primary,#374151)] text-[var(--portal-on-primary,#fff)] hover:opacity-90 disabled:opacity-40 whitespace-nowrap transition-opacity"
              >
                {saving ? '作成中' : '運営者を作成'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => onDiscardDraft(operator.id)}
                title="この行を破棄"
                className="p-1.5 rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-black/5 hover:text-[var(--md-sys-color-error)] disabled:opacity-40 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </>
          ) : (
            <>
              {operator.storeCount > 0 && (
                <span className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">
                  {operator.storeCount}店舗
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
                    onClick={() => onSaveRow(operator.id)}
                    className="inline-flex items-center gap-1 text-xs font-medium px-3 h-7 rounded-full bg-[var(--portal-primary,#374151)] text-[var(--portal-on-primary,#fff)] hover:opacity-90 disabled:opacity-50 whitespace-nowrap transition-opacity"
                  >
                    {saving ? '保存中' : '変更を保存'}
                  </button>
                </>
              )}
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
  operators: BulkOperator[]
  onClose: () => void
}

export default function OperatorBulkEditModal({ open, operators, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const [rows, setRows] = useState<BulkOperator[]>([])
  const [dirty, setDirty] = useState<DirtyMap>({})
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [rowFlash, setRowFlash] = useState<Record<string, RowFlash>>({})
  const [banner, setBanner] = useState<string | null>(null)

  // 運営店舗の選択用（全店舗リスト＋選択モーダル）
  const [allStores, setAllStores] = useState<{ id: string; name: string; code: string; prefecture: string | null; operatorId: string | null; operatorName: string | null }[]>([])
  const [storeEditId, setStoreEditId] = useState<string | null>(null)
  const [storeSearch, setStoreSearch] = useState('')

  const rowsRef = useRef<BulkOperator[]>([])
  rowsRef.current = rows
  const dirtyRef = useRef<DirtyMap>({})
  dirtyRef.current = dirty
  const draftCounter = useRef(0)

  useEffect(() => {
    if (open) {
      setRows(operators)
      setDirty({})
      setEditingCell(null)
      setSavingIds(new Set())
      setRowFlash({})
      setBanner(null)
      setStoreEditId(null)
      setStoreSearch('')
      draftCounter.current = 0
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // 全店舗リストを取得（運営店舗の選択用）
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch('/api/stores')
      .then(r => (r.ok ? r.json() : []))
      .then((d: any[]) => {
        if (cancelled) return
        const list = Array.isArray(d)
          ? d.map(s => ({
              id: s.id, name: s.name, code: s.code, prefecture: s.prefecture ?? null,
              operatorId: s.operatorId ?? null, operatorName: s.operator?.name ?? null,
            }))
          : []
        setAllStores(list)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  const dirtyCount = Object.keys(dirty).length

  const attemptClose = useCallback(() => {
    const n = Object.keys(dirtyRef.current).length
    if (n > 0 && !window.confirm(`未保存の変更が${n}件あります。破棄して閉じますか？`)) return
    onClose()
  }, [onClose])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handler = (e: Event) => { e.preventDefault(); attemptClose() }
    dialog.addEventListener('cancel', handler)
    return () => dialog.removeEventListener('cancel', handler)
  }, [attemptClose])

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  const handleStartEdit = useCallback((id: string, field: string) => setEditingCell({ id, field }), [])
  const handleEndEdit = useCallback(() => setEditingCell(null), [])

  const handleCommit = useCallback((id: string, changes: Record<string, string>) => {
    const row = rowsRef.current.find(r => r.id === id)
    if (!row) return
    setDirty(prev => {
      const rowDirty = { ...(prev[id] ?? {}) }
      for (const [field, value] of Object.entries(changes)) {
        const original = normalize(row[field as keyof BulkOperator])
        if (value === original) delete rowDirty[field]
        else rowDirty[field] = value
      }
      const next = { ...prev }
      if (Object.keys(rowDirty).length === 0) delete next[id]
      else next[id] = rowDirty
      return next
    })
  }, [])

  const handleRevert = useCallback((id: string, field: string) => {
    setDirty(prev => {
      const rowDirty = { ...(prev[id] ?? {}) }
      delete rowDirty[field]
      const next = { ...prev }
      if (Object.keys(rowDirty).length === 0) delete next[id]
      else next[id] = rowDirty
      return next
    })
  }, [])

  const handleEditStores = useCallback((id: string) => { setStoreSearch(''); setStoreEditId(id) }, [])

  // 運営店舗の選択変更（元と同じなら dirty 解除）
  const handleCommitStores = useCallback((id: string, storeIds: string[]) => {
    const row = rowsRef.current.find(r => r.id === id)
    if (!row) return
    const originalJson = JSON.stringify([...row.storeIds].sort())
    const newJson = JSON.stringify([...storeIds].sort())
    setDirty(prev => {
      const rowDirty = { ...(prev[id] ?? {}) }
      if (newJson === originalJson) delete rowDirty.storeIds
      else rowDirty.storeIds = JSON.stringify(storeIds)
      const next = { ...prev }
      if (Object.keys(rowDirty).length === 0) delete next[id]
      else next[id] = rowDirty
      return next
    })
  }, [])

  const handleSaveRow = useCallback(async (id: string) => {
    const changes = dirtyRef.current[id]
    if (!changes || Object.keys(changes).length === 0) return
    const row = rowsRef.current.find(r => r.id === id)
    if (!row) return
    // 運営店舗の変更は専用API（PUT stores）で処理するため、PATCH対象から分離する
    const { storeIds: storeIdsRaw, ...fieldChanges } = changes
    const storeIdsChanged = typeof storeIdsRaw === 'string'
    const { payload, error } = buildPayload(row, fieldChanges)
    if (error) {
      setBanner(error)
      setRowFlash(prev => ({ ...prev, [id]: 'error' }))
      return
    }
    setSavingIds(prev => new Set(prev).add(id))
    setBanner(null)
    try {
      let merged = row
      // 1) 運営者フィールドの更新（変更があれば）
      if (Object.keys(payload).length > 0) {
        const res = await fetch(`/api/admin/operators/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || '保存に失敗しました')
        merged = toBulkOperator({ ...row, ...data, _count: { stores: row.storeCount }, storeIds: row.storeIds })
      }
      // 2) 運営店舗の紐付け更新（変更があれば）
      if (storeIdsChanged) {
        const storeIds = JSON.parse(storeIdsRaw as string) as string[]
        const res = await fetch(`/api/admin/operators/${id}/stores`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeIds }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || '運営店舗の保存に失敗しました')
        const savedStores = Array.isArray(data.stores) ? data.stores : []
        merged = { ...merged, storeIds: savedStores.map((s: any) => s.id), storeCount: savedStores.length }
      }
      setRows(prev => prev.map(r => (r.id === id ? merged : r)))
      setDirty(prev => { const next = { ...prev }; delete next[id]; return next })
      setRowFlash(prev => ({ ...prev, [id]: 'saved' }))
      setTimeout(() => setRowFlash(prev => {
        const next = { ...prev }; if (next[id] === 'saved') delete next[id]; return next
      }), 2500)
    } catch (err) {
      setRowFlash(prev => ({ ...prev, [id]: 'error' }))
      setBanner(err instanceof Error ? err.message : '保存に失敗しました')
    } finally {
      setSavingIds(prev => { const next = new Set(prev); next.delete(id); return next })
    }
  }, [])

  const handleAddRow = useCallback(() => {
    draftCounter.current += 1
    const id = `${DRAFT_PREFIX}${draftCounter.current}`
    setRows(prev => [...prev, makeDraftRow(id)])
    setEditingCell({ id, field: 'name' })
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }, 50)
  }, [])

  const handleDiscardDraft = useCallback((id: string) => {
    setRows(prev => prev.filter(r => r.id !== id))
    setDirty(prev => { const next = { ...prev }; delete next[id]; return next })
    setRowFlash(prev => { const next = { ...prev }; delete next[id]; return next })
    setEditingCell(prev => (prev?.id === id ? null : prev))
  }, [])

  const handleCreateRow = useCallback(async (id: string) => {
    const base = rowsRef.current.find(r => r.id === id)
    if (!base) return
    const changes = dirtyRef.current[id] ?? {}
    // ドラフトの現在値（初期値 + 差分）を全カラム集約
    const merged: Record<string, string> = {}
    for (const col of COLUMNS) {
      if (col.key === 'storeIds') continue // 運営店舗は作成後に紐付ける
      merged[col.key] = changes[col.key] ?? normalize(base[col.key])
    }
    const { payload, error } = buildPayload(base, merged)
    if (error) {
      setBanner(error)
      setRowFlash(prev => ({ ...prev, [id]: 'error' }))
      return
    }
    setSavingIds(prev => new Set(prev).add(id))
    setBanner(null)
    setRowFlash(prev => { const next = { ...prev }; delete next[id]; return next })
    try {
      const res = await fetch('/api/admin/operators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '運営者の作成に失敗しました')
      const created = toBulkOperator(data)
      setRows(prev => prev.map(r => (r.id === id ? created : r)))
      setDirty(prev => { const next = { ...prev }; delete next[id]; return next })
      setRowFlash(prev => ({ ...prev, [created.id]: 'saved' }))
      setTimeout(() => setRowFlash(prev => {
        const next = { ...prev }; if (next[created.id] === 'saved') delete next[created.id]; return next
      }), 2500)
    } catch (err) {
      setRowFlash(prev => ({ ...prev, [id]: 'error' }))
      setBanner(err instanceof Error ? err.message : '運営者の作成に失敗しました')
    } finally {
      setSavingIds(prev => { const next = new Set(prev); next.delete(id); return next })
    }
  }, [])

  const handleDiscardAll = useCallback(() => {
    const n = Object.keys(dirtyRef.current).length
    if (n === 0) return
    if (window.confirm(`${n}件の未保存の変更をすべて破棄しますか？（新規追加した行も削除されます）`)) {
      setDirty({})
      setEditingCell(null)
      setRows(prev => prev.filter(r => !isDraft(r.id)))
    }
  }, [])

  if (!open) return null

  const draftCount = rows.filter(r => isDraft(r.id)).length
  const savedCount = rows.length - draftCount
  const totalWidth = COLUMNS.reduce((sum, c) => sum + c.width, 0) + 200

  return (
    <dialog
      ref={dialogRef}
      className="fixed inset-0 z-50 m-0 p-0 w-full h-full max-w-none max-h-none bg-transparent backdrop:bg-[var(--md-sys-color-scrim)]/50"
    >
      <div className="relative w-full h-full bg-[var(--md-sys-color-surface-container-lowest,#fff)] flex flex-col">
        {/* ヘッダー */}
        <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)]">
          <div className="flex items-center gap-4 min-w-0">
            <h2 className="text-base font-bold text-[var(--md-sys-color-on-surface)] whitespace-nowrap">
              運営者情報の一括編集
            </h2>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] hidden sm:block">
              セルをダブルクリックで編集 → 行ごとに「変更を保存」で反映。{INHERITED_LABELS}を保存すると、紐づく全店舗へ自動反映されます
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={handleAddRow}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3.5 h-8 rounded-full bg-[var(--portal-primary,#374151)] text-[var(--portal-on-primary,#fff)] hover:opacity-90 transition-opacity whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              行を追加
            </button>
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
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <table className="text-sm border-collapse table-fixed" style={{ minWidth: totalWidth }}>
            <colgroup>
              {COLUMNS.map(col => (
                <col key={col.key} style={{ width: col.width }} />
              ))}
              <col style={{ width: 200 }} />
            </colgroup>
            <thead>
              <tr>
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className={`sticky top-0 px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container)] border-b border-[var(--md-sys-color-outline-variant)] ${
                      col.key === 'name' ? 'left-0 z-30 border-r' : 'z-20'
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
              {rows.map(op => (
                <GridRow
                  key={op.id}
                  operator={op}
                  draft={isDraft(op.id)}
                  rowDirty={dirty[op.id]}
                  editingField={editingCell?.id === op.id ? editingCell.field : null}
                  saving={savingIds.has(op.id)}
                  flash={rowFlash[op.id]}
                  onStartEdit={handleStartEdit}
                  onEndEdit={handleEndEdit}
                  onCommit={handleCommit}
                  onRevert={handleRevert}
                  onSaveRow={handleSaveRow}
                  onCreateRow={handleCreateRow}
                  onDiscardDraft={handleDiscardDraft}
                  onEditStores={handleEditStores}
                />
              ))}
              <tr>
                <td colSpan={COLUMNS.length + 1} className="p-0 border-b border-[var(--md-sys-color-outline-variant)]">
                  <button
                    type="button"
                    onClick={handleAddRow}
                    className="sticky left-0 flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[var(--portal-primary,#374151)] hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors w-max"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    運営者を追加
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)]">
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            {savedCount}件
            {draftCount > 0 && (
              <span className="ml-3 font-medium text-[var(--portal-primary,#374151)]">
                新規追加行 {draftCount}件（未作成）
              </span>
            )}
            {dirtyCount > 0 && (
              <span className="ml-3 font-medium text-[var(--md-sys-color-on-surface)]">
                {dirtyCount}件に未保存の変更があります
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {dirtyCount > 0 && (
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

        {/* ─── 運営店舗の選択オーバーレイ ─── */}
        {storeEditId && (() => {
          const opRow = rows.find(r => r.id === storeEditId)
          if (!opRow) return null
          const selected: string[] = dirty[storeEditId]?.storeIds ? JSON.parse(dirty[storeEditId].storeIds) : opRow.storeIds
          const selectedSet = new Set(selected)
          const q = storeSearch.trim()
          const filtered = q
            ? allStores.filter(s => `${s.name}${s.code}${s.prefecture ?? ''}`.includes(q))
            : allStores
          const toggle = (sid: string) => {
            const next = selectedSet.has(sid) ? selected.filter(x => x !== sid) : [...selected, sid]
            handleCommitStores(storeEditId, next)
          }
          return (
            <div
              className="absolute inset-0 z-[70] flex items-center justify-center bg-[var(--md-sys-color-scrim)]/50 p-4"
              onClick={() => setStoreEditId(null)}
            >
              <div
                className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-2xl bg-[var(--md-sys-color-surface-container-lowest,#fff)] shadow-xl border border-[var(--md-sys-color-outline-variant)]"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--md-sys-color-outline-variant)]">
                  <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] truncate">
                    運営店舗 <span className="text-sm font-normal text-[var(--md-sys-color-on-surface-variant)]">— {opRow.name}</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setStoreEditId(null)}
                    className="inline-flex items-center gap-1 text-xs font-medium px-3 h-8 rounded-full bg-[var(--portal-primary,#374151)] text-[var(--portal-on-primary,#fff)] hover:opacity-90"
                  >
                    完了（{selected.length}店舗）
                  </button>
                </div>
                <div className="px-5 py-2 border-b border-[var(--md-sys-color-outline-variant)]">
                  <input
                    type="text"
                    value={storeSearch}
                    onChange={e => setStoreSearch(e.target.value)}
                    placeholder="店舗名・コード・都道府県で検索"
                    className="w-full text-sm px-3 h-9 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] text-[var(--md-sys-color-on-surface)] outline-none focus:border-[var(--md-sys-color-primary)]"
                  />
                  <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
                    変更は自動反映。「変更を保存」で確定してください。他運営者に紐づく店舗を選ぶと付け替えになります。
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto px-2 py-2">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] text-center py-8">該当する店舗がありません</p>
                  ) : (
                    filtered.map(s => {
                      const checked = selectedSet.has(s.id)
                      const otherOwner = s.operatorId && s.operatorId !== opRow.id ? s.operatorName : null
                      return (
                        <label
                          key={s.id}
                          className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer hover:bg-[var(--md-sys-color-surface-container-high)]"
                        >
                          <input type="checkbox" checked={checked} onChange={() => toggle(s.id)} className="w-4 h-4 accent-[var(--portal-primary,#374151)]" />
                          <span className="flex-1 min-w-0 text-sm text-[var(--md-sys-color-on-surface)] truncate">
                            {s.name}
                            {s.prefecture && <span className="text-[var(--md-sys-color-on-surface-variant)] ml-1.5 text-xs">{s.prefecture}</span>}
                          </span>
                          {otherOwner && (
                            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">
                              現: {otherOwner}
                            </span>
                          )}
                        </label>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    </dialog>
  )
}
