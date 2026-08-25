'use client'

import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react'
import { PREFECTURES } from '@/lib/prefectures'
import { STORE_STATUSES } from '@/lib/store-status'
import {
  STORE_SERVICES, STORE_SERVICE_BADGE,
  parseStoreServices, stringifyStoreServices,
} from '@/lib/store-services'
import BulkEditCell, { type CellEditorType } from './BulkEditCell'
import ServiceAreaEditor from './ServiceAreaEditor'

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
  operatorId: string | null
  serviceAreas: string | null
  supportedServices: string | null
}

// 運営者から継承される項目（運営者が「正」。運営者割り当て済み店舗では読み取り専用）
const OPERATOR_INHERITED_KEYS = new Set<string>([
  'bankName', 'branchName', 'accountType', 'accountNumber', 'accountHolder',
  'antiquePermitNumber', 'invoiceNumber',
])

type ColumnDef = {
  key: keyof BulkStore & string
  label: string
  editor: CellEditorType
  options?: { value: string; label: string }[]
  width: number
  readOnly?: boolean
}

// 列定義。key は PATCH /api/admin/stores/[id] updateDetails のホワイトリストと一致させること
// 店舗コードは編集不可のため表示しない。左固定は店舗名列のみ
const COLUMNS: ColumnDef[] = [
  { key: 'name', label: '店舗名', editor: 'text', width: 180 },
  {
    key: 'storeStatus', label: 'ステータス', editor: 'select', width: 120,
    options: STORE_STATUSES.map(s => ({ value: s.value, label: s.label })),
  },
  // 運営者。options は実行時に運営者一覧をマージして表示（下記 GridRow 参照）
  { key: 'operatorId', label: '運営者', editor: 'select', width: 170, options: [{ value: '', label: '（未割り当て）' }] },
  { key: 'postalCode', label: '郵便番号', editor: 'postal', width: 110 },
  {
    key: 'prefecture', label: '都道府県', editor: 'select', width: 110,
    options: [
      { value: '', label: '（未設定）' },
      ...PREFECTURES.map(p => ({ value: p, label: p })),
    ],
  },
  { key: 'address', label: '住所', editor: 'text', width: 260 },
  // 対応エリアは専用エディタ（都道府県＋市区町村）で編集するため GridRow で特別扱いする
  { key: 'serviceAreas', label: '対応エリア', editor: 'text', width: 200 },
  // 対応サービスはセル内トグルチップで編集するため GridRow で特別扱いする
  { key: 'supportedServices', label: '対応サービス', editor: 'text', width: 200 },
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

// 新規追加（ドラフト）行の一時ID接頭辞。保存前の行を判別する
const DRAFT_PREFIX = '__new_'
const isDraft = (id: string) => id.startsWith(DRAFT_PREFIX)

// 比較・表示用の正規化: 日付は YYYY-MM-DD、null/undefined は ''
function normalize(key: string, raw: unknown): string {
  if (raw == null) return ''
  const s = String(raw)
  return DATE_KEYS.has(key) ? s.slice(0, 10) : s
}

// 空のドラフト行を生成（ステータスは既定で営業中）
function makeDraftRow(id: string): BulkStore {
  return {
    id, code: '', name: '', storeStatus: 'active',
    postalCode: null, prefecture: null, address: null, phone: null, email: null,
    openingDate: null, closingDate: null,
    googleBusinessUrl: null, oikuraPageUrl: null, lineAddFriendUrl: null,
    bankName: null, branchName: null, accountType: null, accountNumber: null, accountHolder: null,
    invoiceNumber: null, antiquePermitNumber: null, contractNotifyEmail: null, calendarInviteEmail: null,
    operatorId: null, serviceAreas: null, supportedServices: '[]',
  }
}

// APIレスポンスの店舗オブジェクトを BulkStore 形に正規化
function toBulkStore(s: Record<string, any>): BulkStore {
  return {
    id: s.id, code: s.code ?? '', name: s.name ?? '',
    storeStatus: s.storeStatus ?? null,
    postalCode: s.postalCode ?? null, prefecture: s.prefecture ?? null,
    address: s.address ?? null, phone: s.phone ?? null, email: s.email ?? null,
    openingDate: s.openingDate ?? null, closingDate: s.closingDate ?? null,
    googleBusinessUrl: s.googleBusinessUrl ?? null, oikuraPageUrl: s.oikuraPageUrl ?? null,
    lineAddFriendUrl: s.lineAddFriendUrl ?? null,
    bankName: s.bankName ?? null, branchName: s.branchName ?? null,
    accountType: s.accountType ?? null, accountNumber: s.accountNumber ?? null,
    accountHolder: s.accountHolder ?? null, invoiceNumber: s.invoiceNumber ?? null,
    antiquePermitNumber: s.antiquePermitNumber ?? null,
    contractNotifyEmail: s.contractNotifyEmail ?? null,
    calendarInviteEmail: s.calendarInviteEmail ?? null,
    operatorId: s.operatorId ?? null,
    serviceAreas: s.serviceAreas ?? null,
    supportedServices: s.supportedServices ?? null,
  }
}

// 対応エリアJSONの要約（例: 「3県・12市区町村」）
function serviceAreaSummary(json: string | null | undefined): string {
  try {
    const arr = JSON.parse(json || '[]')
    if (!Array.isArray(arr) || arr.length === 0) return ''
    const prefs = arr.filter((a: any) => a && typeof a.prefecture === 'string')
    const cityCount = prefs.reduce((n: number, a: any) => n + (Array.isArray(a.cities) ? a.cities.length : 0), 0)
    return `${prefs.length}県・${cityCount}市区町村`
  } catch {
    return ''
  }
}

type DirtyMap = Record<string, Record<string, string>>
type PresenceEntry = { adminId: string; adminName: string; storeId: string | null }
type RowFlash = 'saved' | 'error'

// 公開フォームURL（店舗コードから導出・読み取り専用・コピー可）
// path は '/inquiry' | '/tel' | '/line'
function PublicFormUrlCell({ code, path }: { code: string; path: string }) {
  const [copied, setCopied] = useState(false)
  if (!code) {
    return <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] px-2">保存後に発行</span>
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const url = `${origin}${path}/${code}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // クリップボードAPIが使えない環境向けのフォールバック（店舗詳細ページと同じ）
      const ta = document.createElement('textarea')
      ta.value = url
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch {}
      document.body.removeChild(ta)
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex items-center gap-1">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={url}
        className="flex-1 min-w-0 truncate text-xs underline text-[var(--md-sys-color-primary)]"
      >
        {url}
      </a>
      <button
        type="button"
        onClick={copy}
        title="URLをコピー"
        className="p-1 rounded text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] flex-shrink-0"
      >
        {copied ? (
          <svg className="w-4 h-4 text-[var(--status-completed-text,#1a7f37)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────
// 行コンポーネント（memo でセル編集時の全行再レンダリングを防止）
// ─────────────────────────────────────────────
type GridRowProps = {
  store: BulkStore
  draft: boolean
  operators: { id: string; name: string }[]
  rowDirty: Record<string, string> | undefined
  editingField: string | null
  presenceNames: string[] | undefined
  saving: boolean
  loginBusy: boolean
  flash: RowFlash | undefined
  onStartEdit: (storeId: string, field: string) => void
  onEndEdit: () => void
  onCommit: (storeId: string, changes: Record<string, string>) => void
  onRevert: (storeId: string, field: string) => void
  onSaveRow: (storeId: string) => void
  onCreateRow: (storeId: string) => void
  onDiscardDraft: (storeId: string) => void
  onFetchLoginInfo: (storeId: string) => void
  onEditServiceArea: (storeId: string) => void
}

const GridRow = memo(function GridRow({
  store, draft, operators, rowDirty, editingField, presenceNames, saving, loginBusy, flash,
  onStartEdit, onEndEdit, onCommit, onRevert, onSaveRow, onCreateRow, onDiscardDraft, onFetchLoginInfo, onEditServiceArea,
}: GridRowProps) {
  const dirtyCount = rowDirty ? Object.keys(rowDirty).length : 0
  const nameValue = (rowDirty?.name ?? normalize('name', store.name)).trim()
  const canCreate = nameValue !== ''

  // 運営者の割り当て状況（未保存の変更があればそちらを優先）。割り当て済みなら継承項目はロック
  const operatorIdValue = rowDirty?.operatorId ?? normalize('operatorId', store.operatorId)
  const hasOperator = operatorIdValue !== ''

  return (
    <tr className={`border-b border-[var(--md-sys-color-outline-variant)] ${draft ? 'bg-[var(--md-sys-color-primary-container,#e0e7ff)]/30' : ''}`}>
      {COLUMNS.map(col => {
        const original = normalize(col.key, store[col.key])
        const value = rowDirty?.[col.key] ?? original
        // 対応エリアは専用エディタで編集（サマリー表示＋ボタン）
        if (col.key === 'serviceAreas') {
          const summary = serviceAreaSummary(value)
          const isDirty = rowDirty ? 'serviceAreas' in rowDirty : false
          return (
            <td key={col.key} className="px-1 py-1">
              <button
                type="button"
                onClick={() => onEditServiceArea(store.id)}
                className={`w-full text-left text-xs px-2 h-8 rounded-md border truncate transition-colors ${
                  isDirty
                    ? 'border-[var(--md-sys-color-tertiary,#b45309)] bg-[var(--md-sys-color-tertiary-container,#fef3c7)]/40'
                    : 'border-[var(--md-sys-color-outline-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                } text-[var(--md-sys-color-on-surface)]`}
                title="対応エリアを編集"
              >
                {summary || <span className="text-[var(--md-sys-color-on-surface-variant)]">対応エリアを設定</span>}
              </button>
            </td>
          )
        }
        // 対応サービスはセル内トグルチップで直接切り替え（dirty値はJSON文字列）
        if (col.key === 'supportedServices') {
          const selectedKeys = parseStoreServices(value)
          const isDirty = rowDirty ? 'supportedServices' in rowDirty : false
          return (
            <td key={col.key} className="px-1 py-1">
              <div className={`flex items-center gap-1 px-1 h-8 rounded-md ${isDirty ? 'bg-[var(--md-sys-color-tertiary-container,#fef3c7)]/40' : ''}`}>
                {STORE_SERVICES.map(svc => {
                  const selected = selectedKeys.includes(svc.key)
                  return (
                    <button
                      key={svc.key}
                      type="button"
                      aria-pressed={selected}
                      title={`${svc.label}を${selected ? '解除' : '設定'}`}
                      onClick={() => {
                        const next = selected
                          ? selectedKeys.filter(k => k !== svc.key)
                          : [...selectedKeys, svc.key]
                        onCommit(store.id, { supportedServices: stringifyStoreServices(next) })
                      }}
                      className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap border transition-colors ${
                        selected
                          ? 'border-transparent'
                          : 'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)]'
                      }`}
                      style={selected ? { backgroundColor: STORE_SERVICE_BADGE[svc.key].bg, color: STORE_SERVICE_BADGE[svc.key].fg } : undefined}
                    >
                      {svc.label}
                    </button>
                  )
                })}
              </div>
            </td>
          )
        }
        const inheritedLocked = hasOperator && OPERATOR_INHERITED_KEYS.has(col.key)
        const options = col.key === 'operatorId'
          ? [{ value: '', label: '（未割り当て）' }, ...operators.map(o => ({ value: o.id, label: o.name }))]
          : col.options
        const cell = (
          <BulkEditCell
            storeId={store.id}
            field={col.key}
            editor={col.editor}
            options={options}
            searchable={col.key === 'operatorId'}
            value={value}
            dirty={rowDirty ? col.key in rowDirty : false}
            editing={editingField === col.key}
            readOnly={col.readOnly || inheritedLocked}
            lockHint={inheritedLocked}
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
            title={inheritedLocked ? '運営者情報から自動反映されます（この店舗では編集不可。運営者情報を編集してください）' : undefined}
          >
            {cell}
          </td>
        )
      })}

      {/* 公開フォームURL（表示・コピー。いずれも店舗コードから導出） */}
      <td className="px-1 py-1">
        <PublicFormUrlCell code={store.code} path="/inquiry" />
      </td>
      <td className="px-1 py-1">
        <PublicFormUrlCell code={store.code} path="/tel" />
      </td>
      <td className="px-1 py-1">
        <PublicFormUrlCell code={store.code} path="/line" />
      </td>

      {/* アクション列（sticky 右端）: 新規作成 / 変更あり・保存 / ログイン情報取得 / 他ユーザー編集中 */}
      <td className={`sticky right-0 z-10 px-2 py-1 border-l border-[var(--md-sys-color-outline-variant)] ${draft ? 'bg-[var(--md-sys-color-primary-container,#eef2ff)]' : 'bg-[var(--md-sys-color-surface-container-lowest,#fff)]'}`}>
        <div className="flex items-center gap-2 min-h-8">
          {/* ── ドラフト行: 店舗を作成 / 破棄 ── */}
          {draft ? (
            <>
              {flash === 'error' && (
                <span className="text-xs text-[var(--md-sys-color-error)] whitespace-nowrap">作成に失敗</span>
              )}
              <button
                type="button"
                disabled={saving || !canCreate}
                title={canCreate ? undefined : '店舗名を入力してください'}
                onClick={() => onCreateRow(store.id)}
                className="inline-flex items-center gap-1 text-xs font-medium px-3 h-7 rounded-full bg-[var(--portal-primary,#374151)] text-[var(--portal-on-primary,#fff)] hover:opacity-90 disabled:opacity-40 whitespace-nowrap transition-opacity"
              >
                {saving ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                )}
                {saving ? '作成中' : '店舗を作成'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => onDiscardDraft(store.id)}
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
              {/* ── 初期ログイン情報を取得（保存済み行のみ・常時表示）── */}
              <button
                type="button"
                disabled={loginBusy}
                onClick={() => onFetchLoginInfo(store.id)}
                title="初期ログイン情報を取得（パスワードを再発行）"
                className="inline-flex items-center gap-1 text-xs font-medium px-2.5 h-7 rounded-full border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] disabled:opacity-40 whitespace-nowrap transition-colors"
              >
                {loginBusy ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                )}
                ログイン情報
              </button>
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
  operators: { id: string; name: string }[]
  onClose: () => void
}

// パスワード表示オーバーレイの状態
type LoginInfo = { storeId: string; storeName: string; password: string; email: string | null }

export default function StoreBulkEditModal({ open, stores, operators, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // グリッドのローカルデータ（保存成功時にAPIレスポンスで更新）
  const [rows, setRows] = useState<BulkStore[]>([])
  const [dirty, setDirty] = useState<DirtyMap>({})
  const [editingCell, setEditingCell] = useState<{ storeId: string; field: string } | null>(null)
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set())
  const [rowFlash, setRowFlash] = useState<Record<string, RowFlash>>({})
  const [others, setOthers] = useState<PresenceEntry[]>([])
  const [banner, setBanner] = useState<string | null>(null)

  // 初期ログイン情報オーバーレイ
  const [loginInfo, setLoginInfo] = useState<LoginInfo | null>(null)
  const [loginBusyId, setLoginBusyId] = useState<string | null>(null)
  const [copiedPw, setCopiedPw] = useState(false)
  const [copiedEmail, setCopiedEmail] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  // 対応エリア編集の対象店舗ID（サブモーダル）
  const [areaEditId, setAreaEditId] = useState<string | null>(null)
  const handleEditServiceArea = useCallback((storeId: string) => setAreaEditId(storeId), [])

  const rowsRef = useRef<BulkStore[]>([])
  rowsRef.current = rows
  const dirtyRef = useRef<DirtyMap>({})
  dirtyRef.current = dirty
  const editingRef = useRef(editingCell)
  editingRef.current = editingCell
  const draftCounter = useRef(0)

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
      setLoginInfo(null)
      setLoginBusyId(null)
      draftCounter.current = 0
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

  // ── 行追加: 末尾に空のドラフト行を追加し、その行までスクロール ──
  const handleAddRow = useCallback(() => {
    draftCounter.current += 1
    const id = `${DRAFT_PREFIX}${draftCounter.current}`
    setRows(prev => [...prev, makeDraftRow(id)])
    // 追加行を編集開始状態にし、末尾へスクロール
    setEditingCell({ storeId: id, field: 'name' })
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }, 50)
  }, [])

  // ── ドラフト行を破棄 ──
  const handleDiscardDraft = useCallback((storeId: string) => {
    setRows(prev => prev.filter(r => r.id !== storeId))
    setDirty(prev => {
      const next = { ...prev }
      delete next[storeId]
      return next
    })
    setRowFlash(prev => {
      const next = { ...prev }
      delete next[storeId]
      return next
    })
    setEditingCell(prev => (prev?.storeId === storeId ? null : prev))
  }, [])

  // ── ドラフト行から店舗を作成（POST /api/admin/stores）──
  const handleCreateRow = useCallback(async (storeId: string) => {
    const base = rowsRef.current.find(r => r.id === storeId)
    if (!base) return
    const changes = dirtyRef.current[storeId] ?? {}
    // 全編集カラムの現在値を集約（base の初期値 + dirty の上書き）
    const payload: Record<string, string> = {}
    for (const col of COLUMNS) {
      const v = (changes[col.key] ?? normalize(col.key, base[col.key])).trim()
      if (v) payload[col.key] = v
    }
    if (!payload.name) {
      setBanner('店舗名を入力してください')
      setRowFlash(prev => ({ ...prev, [storeId]: 'error' }))
      return
    }
    setSavingIds(prev => new Set(prev).add(storeId))
    setBanner(null)
    setRowFlash(prev => {
      const next = { ...prev }
      delete next[storeId]
      return next
    })
    try {
      const res = await fetch('/api/admin/stores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '店舗の作成に失敗しました')
      const created = toBulkStore(data.store)
      // ドラフト行を実データに差し替え、dirty を解除
      setRows(prev => prev.map(r => (r.id === storeId ? created : r)))
      setDirty(prev => {
        const next = { ...prev }
        delete next[storeId]
        return next
      })
      setRowFlash(prev => ({ ...prev, [created.id]: 'saved' }))
      setTimeout(() => {
        setRowFlash(prev => {
          const next = { ...prev }
          if (next[created.id] === 'saved') delete next[created.id]
          return next
        })
      }, 2500)
      // 初期ログイン情報を表示
      setCopiedPw(false); setCopiedEmail(false); setSendingEmail(false); setEmailSent(false)
      setLoginInfo({ storeId: created.id, storeName: created.name, password: data.password, email: created.email })
    } catch (err) {
      setRowFlash(prev => ({ ...prev, [storeId]: 'error' }))
      setBanner(err instanceof Error ? err.message : '店舗の作成に失敗しました')
    } finally {
      setSavingIds(prev => {
        const next = new Set(prev)
        next.delete(storeId)
        return next
      })
    }
  }, [])

  // ── 既存店舗の初期ログイン情報を取得（パスワード再発行）──
  const handleFetchLoginInfo = useCallback(async (storeId: string) => {
    const store = rowsRef.current.find(r => r.id === storeId)
    if (!store) return
    if (!window.confirm(
      `「${store.name}」の初期ログイン情報を取得します。\n\n` +
      `新しいパスワードが発行され、現在のパスワードは無効になります。\n` +
      `すでにログイン中の店舗がある場合はご注意ください。よろしいですか？`
    )) return
    setLoginBusyId(storeId)
    setBanner(null)
    try {
      const res = await fetch(`/api/admin/stores/${storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetPassword: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || '初期ログイン情報の取得に失敗しました')
      setCopiedPw(false); setCopiedEmail(false); setSendingEmail(false); setEmailSent(false)
      setLoginInfo({ storeId, storeName: store.name, password: data.password, email: store.email })
    } catch (err) {
      setBanner(err instanceof Error ? err.message : '初期ログイン情報の取得に失敗しました')
    } finally {
      setLoginBusyId(null)
    }
  }, [])

  // ── ログイン情報オーバーレイ: コピー / 通知メール送信 / 閉じる ──
  const handleCopyPassword = useCallback(() => {
    if (!loginInfo) return
    navigator.clipboard.writeText(loginInfo.password)
    setCopiedPw(true)
    setTimeout(() => setCopiedPw(false), 2000)
  }, [loginInfo])

  const handleCopyEmail = useCallback(() => {
    if (!loginInfo?.email) return
    navigator.clipboard.writeText(loginInfo.email)
    setCopiedEmail(true)
    setTimeout(() => setCopiedEmail(false), 2000)
  }, [loginInfo])

  const handleSendLoginEmail = useCallback(async () => {
    if (!loginInfo) return
    setSendingEmail(true)
    try {
      const res = await fetch(`/api/admin/stores/${loginInfo.storeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sendPasswordEmail: true, password: loginInfo.password }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'メールの送信に失敗しました')
      }
      setEmailSent(true)
    } catch (err) {
      setBanner(err instanceof Error ? err.message : 'メールの送信に失敗しました')
    } finally {
      setSendingEmail(false)
    }
  }, [loginInfo])

  const closeLoginInfo = useCallback(() => {
    setLoginInfo(null)
    setCopiedPw(false)
    setCopiedEmail(false)
    setSendingEmail(false)
    setEmailSent(false)
  }, [])

  const handleDiscardAll = useCallback(() => {
    const n = Object.keys(dirtyRef.current).length
    if (n === 0) return
    if (window.confirm(`${n}店舗分の未保存の変更をすべて破棄しますか？（新規追加した行も削除されます）`)) {
      setDirty({})
      setEditingCell(null)
      // 未保存のドラフト行も削除
      setRows(prev => prev.filter(r => !isDraft(r.id)))
    }
  }, [])

  if (!open) return null

  const draftCount = rows.filter(r => isDraft(r.id)).length
  const savedCount = rows.length - draftCount
  const totalWidth = COLUMNS.reduce((sum, c) => sum + c.width, 0) + 280 * 3 + 240 // +公開フォームURL3列 +アクション列

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
              店舗情報の一括編集
            </h2>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] hidden sm:block">
              セルをダブルクリックで編集 → 行ごとに「変更を保存」で反映。運営者を割り当てると銀行口座・古物許可番号・インボイス番号は運営者情報から自動反映されます（🔒 は編集不可）
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
        <div ref={scrollRef} className="flex-1 overflow-auto">
          <table className="text-sm border-collapse table-fixed" style={{ minWidth: totalWidth }}>
            <colgroup>
              {COLUMNS.map(col => (
                <col key={col.key} style={{ width: col.width }} />
              ))}
              <col style={{ width: 280 }} />
              <col style={{ width: 240 }} />
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
                {['問い合わせURL', '電話問い合わせURL', 'LINE登録URL'].map(label => (
                  <th
                    key={label}
                    className="sticky top-0 z-20 px-3 py-2.5 text-left text-xs font-medium whitespace-nowrap uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] bg-[var(--md-sys-color-surface-container)] border-b border-[var(--md-sys-color-outline-variant)]"
                  >
                    {label}
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
                  draft={isDraft(store.id)}
                  operators={operators}
                  rowDirty={dirty[store.id]}
                  editingField={editingCell?.storeId === store.id ? editingCell.field : null}
                  presenceNames={rowPresence.get(store.id)}
                  saving={savingIds.has(store.id)}
                  loginBusy={loginBusyId === store.id}
                  flash={rowFlash[store.id]}
                  onStartEdit={handleStartEdit}
                  onEndEdit={handleEndEdit}
                  onCommit={handleCommit}
                  onRevert={handleRevert}
                  onSaveRow={handleSaveRow}
                  onCreateRow={handleCreateRow}
                  onDiscardDraft={handleDiscardDraft}
                  onFetchLoginInfo={handleFetchLoginInfo}
                  onEditServiceArea={handleEditServiceArea}
                />
              ))}
              {/* 行を追加（スプレッドシート風） */}
              <tr>
                {/* +公開フォームURL3列 +アクション列 */}
                <td colSpan={COLUMNS.length + 4} className="p-0 border-b border-[var(--md-sys-color-outline-variant)]">
                  <button
                    type="button"
                    onClick={handleAddRow}
                    className="sticky left-0 flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[var(--portal-primary,#374151)] hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors w-max"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    店舗を追加
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* フッター */}
        <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)]">
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            {savedCount}店舗
            {draftCount > 0 && (
              <span className="ml-3 font-medium text-[var(--portal-primary,#374151)]">
                新規追加行 {draftCount}件（未作成）
              </span>
            )}
            {dirtyStoreCount > 0 && (
              <span className="ml-3 font-medium text-[var(--md-sys-color-on-surface)]">
                {dirtyStoreCount}件に未保存の変更があります
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

        {/* ─── 対応エリア編集オーバーレイ ─── */}
        {areaEditId && (() => {
          const areaRow = rows.find(r => r.id === areaEditId)
          if (!areaRow) return null
          const areaValue = dirty[areaEditId]?.serviceAreas ?? areaRow.serviceAreas ?? '[]'
          const prefFocus = dirty[areaEditId]?.prefecture ?? areaRow.prefecture ?? ''
          return (
            <div
              className="absolute inset-0 z-[70] flex items-center justify-center bg-[var(--md-sys-color-scrim)]/50 p-4"
              onClick={() => setAreaEditId(null)}
            >
              <div
                className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-[var(--md-sys-color-surface-container-lowest,#fff)] shadow-xl border border-[var(--md-sys-color-outline-variant)] p-5"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">
                    対応エリア <span className="text-sm font-normal text-[var(--md-sys-color-on-surface-variant)]">— {areaRow.name || '新規店舗'}</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setAreaEditId(null)}
                    className="inline-flex items-center gap-1 text-xs font-medium px-3 h-8 rounded-full bg-[var(--portal-primary,#374151)] text-[var(--portal-on-primary,#fff)] hover:opacity-90"
                  >
                    完了
                  </button>
                </div>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-3">
                  変更は自動で反映されます。「完了」で閉じたあと、行の「変更を保存」で確定してください。
                </p>
                <ServiceAreaEditor
                  value={areaValue}
                  focusPrefecture={prefFocus}
                  onChange={(json) => handleCommit(areaEditId, { serviceAreas: json })}
                />
              </div>
            </div>
          )
        })()}

        {/* ─── 初期ログイン情報オーバーレイ ─── */}
        {loginInfo && (
          <div
            className="absolute inset-0 z-[70] flex items-center justify-center bg-[var(--md-sys-color-scrim)]/50 p-4"
            onClick={closeLoginInfo}
          >
            <div
              className="w-full max-w-md bg-[var(--md-sys-color-surface-container-lowest,#fff)] rounded-[var(--md-sys-shape-large,16px)] shadow-[var(--md-sys-elevation-3)] p-6"
              onClick={e => e.stopPropagation()}
              role="dialog"
              aria-label="初期ログイン情報"
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">初期ログイン情報</h3>
                <button
                  type="button"
                  onClick={closeLoginInfo}
                  className="p-1.5 rounded-full text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
                  aria-label="閉じる"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-4">{loginInfo.storeName}</p>

              {/* メールアドレス */}
              <div className="bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] p-4 mb-3">
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-2">ログインメールアドレス</p>
                {loginInfo.email ? (
                  <div className="flex items-center gap-3">
                    <code className="text-base font-medium text-[var(--md-sys-color-on-surface)] flex-1 break-all">
                      {loginInfo.email}
                    </code>
                    <button
                      onClick={handleCopyEmail}
                      className="text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors p-1 flex-shrink-0"
                      title="コピー"
                    >
                      {copiedEmail ? (
                        <svg className="w-5 h-5 text-[var(--status-completed-text,#1a7f37)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--md-sys-color-error)]">
                    メールアドレスが未設定です。グリッドで登録してください。
                  </p>
                )}
              </div>

              {/* パスワード */}
              <div className="bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] rounded-[var(--md-sys-shape-small)] p-4 mb-4">
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-2">ログインパスワード</p>
                <div className="flex items-center gap-3">
                  <code className="text-xl font-bold text-[var(--md-sys-color-on-surface)] tracking-widest flex-1 break-all">
                    {loginInfo.password}
                  </code>
                  <button
                    onClick={handleCopyPassword}
                    className="text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors p-1 flex-shrink-0"
                    title="コピー"
                  >
                    {copiedPw ? (
                      <svg className="w-5 h-5 text-[var(--status-completed-text,#1a7f37)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-2 text-xs text-[var(--md-sys-color-on-error-container)] bg-[var(--md-sys-color-error-container)] rounded-[var(--md-sys-shape-small)] px-3 py-2.5 mb-5">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>このパスワードは一度しか表示されません。必ず控えてから閉じてください。</span>
              </div>

              {loginInfo.email && (
                <button
                  type="button"
                  disabled={sendingEmail || emailSent}
                  onClick={handleSendLoginEmail}
                  className="w-full inline-flex items-center justify-center gap-2 text-sm font-medium px-4 h-10 rounded-full bg-[var(--md-sys-color-secondary-container,#e2e8f0)] text-[var(--md-sys-color-on-secondary-container,#374151)] hover:opacity-90 disabled:opacity-50 transition-opacity mb-3"
                >
                  {emailSent ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className={`w-4 h-4 ${sendingEmail ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {sendingEmail ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      )}
                    </svg>
                  )}
                  {emailSent ? '送信しました' : sendingEmail ? '送信中...' : '通知メールを送信'}
                </button>
              )}

              <button
                type="button"
                onClick={closeLoginInfo}
                className="w-full text-sm font-medium px-4 h-10 rounded-full border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  )
}
