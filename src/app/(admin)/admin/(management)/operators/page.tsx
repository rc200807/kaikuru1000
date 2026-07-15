'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'
import { ENTITY_TYPE_LABEL, formalName, type EntityType } from '@/lib/operator-utils'

type ImportResult = {
  created: number
  errors: { row: number; message: string }[]
}

type Operator = {
  id: string
  entityType: string
  corporatePrefix: string | null
  name: string
  representativeName: string
  invoiceRegistered: boolean
  phone: string | null
  email: string | null
  stores: { id: string; name: string; code: string }[]
  _count: { stores: number }
  updatedAt: string
}

export default function OperatorListPage() {
  const { status } = useSession()
  const router = useRouter()
  const [operators, setOperators] = useState<Operator[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<string>('')

  function refresh() {
    fetch('/api/admin/operators')
      .then(r => r.ok ? r.json() : [])
      .then(setOperators)
  }

  async function handleImport(file: File) {
    setImporting(true)
    setImportError('')
    setImportResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/operators/import', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok && !data.created) {
        setImportError(data.error ?? 'インポートに失敗しました')
        if (Array.isArray(data.errors)) setImportResult({ created: 0, errors: data.errors })
        return
      }
      setImportResult({ created: data.created ?? 0, errors: data.errors ?? [] })
      if (data.created > 0) refresh()
    } finally {
      setImporting(false)
    }
  }

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/admin/operators')
      .then(r => r.ok ? r.json() : [])
      .then(setOperators)
      .finally(() => setLoading(false))
  }, [status])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return operators
    return operators.filter(o => {
      const hay = [o.name, o.representativeName, o.phone ?? '', o.email ?? ''].join(' ').toLowerCase()
      return hay.includes(q)
    })
  }, [operators, search])

  const filteredIds = useMemo(() => filtered.map(o => o.id), [filtered])
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.has(id))
  const someFilteredSelected = !allFilteredSelected && filteredIds.some(id => selectedIds.has(id))

  function toggleSelectAll() {
    const next = new Set(selectedIds)
    if (allFilteredSelected) {
      filteredIds.forEach(id => next.delete(id))
    } else {
      filteredIds.forEach(id => next.add(id))
    }
    setSelectedIds(next)
  }

  function toggleSelect(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return
    setBulkDeleting(true)
    setBulkMessage('')
    try {
      const res = await fetch('/api/admin/operators/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selectedIds] }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setBulkMessage(data.error ?? '削除に失敗しました')
        return
      }
      const data = await res.json()
      setBulkMessage(`${data.deleted}件の運営者を削除しました`)
      setSelectedIds(new Set())
      setConfirmDeleteOpen(false)
      refresh()
    } finally {
      setBulkDeleting(false)
    }
  }

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1280, margin: '0 auto', color: 'var(--md-sys-color-on-surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>運営者情報</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
            会社情報・古物営業許可・契約書を一元管理（{filtered.length}件 / 全{operators.length}件）
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => { setImportResult(null); setImportError(''); setImportOpen(true) }}
            style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', cursor: 'pointer', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13, fontWeight: 600 }}
          >
            CSVインポート
          </button>
          <button
            onClick={() => router.push('/admin/operators/new')}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#4f8ef7', color: '#fff', fontSize: 13, fontWeight: 600 }}
          >
            + 新規追加
          </button>
        </div>
      </div>

      {/* 検索 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ position: 'relative', maxWidth: 480 }}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: 'var(--md-sys-color-on-surface-variant)', pointerEvents: 'none' }}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="検索（会社名/代表者/電話/メール）"
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 12px 8px 36px', borderRadius: 999, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
          />
        </div>
      </div>

      {/* 一括選択アクションバー */}
      {selectedIds.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 14px', marginBottom: 12, borderRadius: 10, background: 'rgba(79,142,247,0.12)', border: '1px solid rgba(79,142,247,0.4)' }}>
          <div style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface)' }}>
            <strong>{selectedIds.size}</strong> 件選択中
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setSelectedIds(new Set())}
              style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid var(--md-sys-color-outline)', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 12, cursor: 'pointer' }}
            >
              選択解除
            </button>
            <button
              onClick={() => setConfirmDeleteOpen(true)}
              style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              削除
            </button>
          </div>
        </div>
      )}

      {bulkMessage && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(74,222,128,0.15)', color: '#4ade80', fontSize: 13 }}>
          {bulkMessage}
        </div>
      )}

      {/* 削除確認モーダル */}
      {confirmDeleteOpen && (
        <div
          onClick={() => !bulkDeleting && setConfirmDeleteOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--md-sys-color-surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 440 }}
          >
            <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 700 }}>選択した運営者を削除しますか？</h2>
            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)', lineHeight: 1.6 }}>
              <strong>{selectedIds.size}</strong> 件の運営者情報を削除します。<br />
              紐付いている店舗の運営者欄は空になります（店舗自体は削除されません）。<br />
              アップロード済みの契約書PDFも削除されます。<span style={{ color: '#f87171' }}>この操作は元に戻せません。</span>
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                onClick={() => setConfirmDeleteOpen(false)}
                disabled={bulkDeleting}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13, cursor: bulkDeleting ? 'wait' : 'pointer' }}
              >
                キャンセル
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#ef4444', color: '#fff', fontSize: 13, fontWeight: 600, cursor: bulkDeleting ? 'wait' : 'pointer', opacity: bulkDeleting ? 0.7 : 1 }}
              >
                {bulkDeleting ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSVインポートモーダル */}
      {importOpen && (
        <div
          onClick={() => !importing && setImportOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--md-sys-color-surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 560, maxHeight: '85vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>運営者情報をCSVインポート</h2>
              <button onClick={() => !importing && setImportOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--md-sys-color-on-surface-variant)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
              CSVファイルから運営者情報を一括登録できます。サンプルCSVをダウンロードして列構成をご確認ください。
            </p>

            <div style={{ marginBottom: 16 }}>
              <a
                href="/api/admin/operators/import"
                download="operators-import-template.csv"
                style={{ display: 'inline-block', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', textDecoration: 'none', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
              >
                ⬇ サンプルCSVをダウンロード
              </a>
            </div>

            <div style={{ marginBottom: 16, padding: 12, background: 'var(--md-sys-color-surface-container-high)', borderRadius: 8, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--md-sys-color-on-surface)' }}>列の指定:</strong><br />
              ・<strong>会社形態</strong>: 「法人」または「個人事業主」<br />
              ・<strong>形態位置</strong>: 「前」または「後」（法人時のみ）<br />
              ・<strong>インボイス登録</strong>: 「はい」「いいえ」（または true/false）<br />
              ・必須列: 会社形態 / 会社名 / 代表者氏名<br />
              ・契約書PDFと運営店舗紐付けはインポート対象外です（個別画面から設定）
            </div>

            {!importResult && (
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px', borderRadius: 12, border: '2px dashed var(--md-sys-color-outline-variant)', cursor: importing ? 'wait' : 'pointer', fontSize: 13, opacity: importing ? 0.6 : 1 }}>
                {importing ? 'インポート中…' : '📎 CSVファイルを選択'}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f) }}
                />
              </label>
            )}

            {importError && (
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: 'rgba(248,113,113,0.15)', color: '#f87171', fontSize: 13 }}>
                {importError}
              </div>
            )}

            {importResult && (
              <div style={{ marginTop: 12 }}>
                <div style={{ padding: '12px 14px', borderRadius: 8, background: importResult.created > 0 ? 'rgba(74,222,128,0.15)' : 'rgba(251,191,36,0.15)', color: importResult.created > 0 ? '#4ade80' : '#fbbf24', fontSize: 13, marginBottom: 12 }}>
                  ✓ {importResult.created} 件の運営者を登録しました
                  {importResult.errors.length > 0 && `（${importResult.errors.length} 件はエラーでスキップ）`}
                </div>
                {importResult.errors.length > 0 && (
                  <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>エラー詳細:</div>
                    {importResult.errors.map((e, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#f87171', marginBottom: 4 }}>
                        行 {e.row}: {e.message}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                  <button
                    onClick={() => { setImportResult(null); setImportError('') }}
                    style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', cursor: 'pointer', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
                  >
                    続けてインポート
                  </button>
                  <button
                    onClick={() => setImportOpen(false)}
                    style={{ padding: '8px 22px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#4f8ef7', color: '#fff', fontSize: 13, fontWeight: 700 }}
                  >
                    閉じる
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 一覧 */}
      <div style={{ background: 'var(--md-sys-color-surface)', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 12, overflow: 'hidden' }}>
        {filtered.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 40, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
            {operators.length === 0 ? '運営者情報がまだ登録されていません' : '該当する運営者がありません'}
          </p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--md-sys-color-surface-container-high)' }}>
                  <th style={{ padding: '10px 14px', width: 32 }}>
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      ref={el => { if (el) el.indeterminate = someFilteredSelected }}
                      onChange={toggleSelectAll}
                      aria-label="すべて選択"
                      style={{ cursor: 'pointer', width: 16, height: 16 }}
                    />
                  </th>
                  <Th>会社形態</Th>
                  <Th>正式名称</Th>
                  <Th>代表者</Th>
                  <Th>店舗数</Th>
                  <Th>インボイス</Th>
                  <Th>更新日</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(op => {
                  const isSelected = selectedIds.has(op.id)
                  return (
                  <tr
                    key={op.id}
                    onClick={() => router.push(`/admin/operators/${op.id}`)}
                    style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', cursor: 'pointer', background: isSelected ? 'rgba(79,142,247,0.08)' : undefined }}
                  >
                    <td
                      onClick={(e) => { e.stopPropagation(); toggleSelect(op.id) }}
                      style={{ padding: '10px 14px', verticalAlign: 'middle', width: 32 }}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelect(op.id)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`${op.name} を選択`}
                        style={{ cursor: 'pointer', width: 16, height: 16 }}
                      />
                    </td>
                    <Td>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                        background: op.entityType === 'corporation' ? 'rgba(79,142,247,0.15)' : 'rgba(148,163,184,0.15)',
                        color: op.entityType === 'corporation' ? '#4f8ef7' : '#94a3b8',
                      }}>
                        {ENTITY_TYPE_LABEL[op.entityType as EntityType] ?? op.entityType}
                      </span>
                    </Td>
                    <Td>{formalName(op)}</Td>
                    <Td>{op.representativeName}</Td>
                    <Td>{op._count.stores}店舗</Td>
                    <Td>
                      {op.invoiceRegistered ? (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>登録済</span>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--md-sys-color-outline)' }}>—</span>
                      )}
                    </Td>
                    <Td>{new Date(op.updatedAt).toLocaleDateString('ja-JP')}</Td>
                  </tr>
                )})}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ textAlign: 'left', padding: '10px 14px', fontWeight: 600, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>{children}</th>
}
function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>{children}</td>
}
