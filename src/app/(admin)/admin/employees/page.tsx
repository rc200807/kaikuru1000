'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'

type Employee = {
  id: string
  employeeNumber: string
  lastName: string
  firstName: string
  department: string | null
  jobTitle: string | null
  employmentType: string | null
  workEmail: string | null
  workPhone: string | null
  hireDate: string | null
  resignDate: string | null
  profilePhotoDriveUrl: string | null
}

export default function EmployeeListPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role as string | undefined
  const canEdit = role === 'superadmin' || role === 'hr'

  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showResigned, setShowResigned] = useState(false)

  // CSVインポート
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ created: number; errors: { row: number; message: string }[] } | null>(null)
  const [importError, setImportError] = useState('')

  function refresh() {
    fetch('/api/admin/employees')
      .then(r => (r.ok ? r.json() : []))
      .then(setEmployees)
  }

  async function handleImport(file: File) {
    setImporting(true)
    setImportError('')
    setImportResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/admin/employees/import', { method: 'POST', body: fd })
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
    fetch('/api/admin/employees')
      .then(r => (r.ok ? r.json() : []))
      .then(setEmployees)
      .finally(() => setLoading(false))
  }, [status])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = employees
    if (!showResigned) list = list.filter(e => !e.resignDate)
    if (q) {
      list = list.filter(e =>
        [e.employeeNumber, e.lastName, e.firstName, e.department ?? '', e.jobTitle ?? '', e.workEmail ?? '']
          .join(' ').toLowerCase().includes(q)
      )
    }
    return list
  }, [employees, search, showResigned])

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1280, margin: '0 auto', color: 'var(--md-sys-color-on-surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>社員情報</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
            {role === 'admin'
              ? '※ 機微情報は閲覧できません（基本情報のみ表示）'
              : '社員の基本情報・人事情報・機微情報を管理'}
            （{filtered.length}件 / 全{employees.length}件）
          </p>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { setImportResult(null); setImportError(''); setImportOpen(true) }}
              style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', cursor: 'pointer', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 14, fontWeight: 600 }}
            >
              CSVインポート
            </button>
            <button
              onClick={() => router.push('/admin/employees/new')}
              style={{ padding: '10px 16px', borderRadius: 8, background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              + 社員を追加
            </button>
          </div>
        )}
      </div>

      {importOpen && (
        <div
          onClick={() => !importing && setImportOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: 'var(--md-sys-color-surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 600, maxHeight: '85vh', overflowY: 'auto' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>社員情報をCSVインポート</h2>
              <button onClick={() => !importing && setImportOpen(false)} style={{ background: 'transparent', border: 'none', color: 'var(--md-sys-color-on-surface-variant)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>

            <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
              CSVファイルから社員情報を一括登録できます。サンプルCSVをダウンロードして列構成をご確認ください。
            </p>

            <div style={{ marginBottom: 16 }}>
              <a
                href="/api/admin/employees/import"
                download="employees-import-template.csv"
                style={{ display: 'inline-block', padding: '8px 14px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', textDecoration: 'none', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
              >
                ⬇ サンプルCSVをダウンロード
              </a>
            </div>

            <div style={{ marginBottom: 16, padding: 12, background: 'var(--md-sys-color-surface-container-high)', borderRadius: 8, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--md-sys-color-on-surface)' }}>仕様:</strong><br />
              ・必須列: 従業員番号 / 苗字 / 名前<br />
              ・日付列（入社・退社・生年月日）: <code>YYYY-MM-DD</code> 形式<br />
              ・<strong>機微情報</strong>（年金/保険/在留カード/振込先）は自動で暗号化保存<br />
              ・婚姻状況: 「未婚」または「既婚」<br />
              ・従業員番号が既に登録済み、または CSV 内で重複している行はスキップ
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
                  ✓ {importResult.created} 件の社員を登録しました
                  {importResult.errors.length > 0 && `（${importResult.errors.length} 件はエラーでスキップ）`}
                </div>
                {importResult.errors.length > 0 && (
                  <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 8, padding: 12 }}>
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

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="従業員番号・氏名・部署で検索"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 240px', maxWidth: 360, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container)', color: 'var(--md-sys-color-on-surface)' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={showResigned} onChange={e => setShowResigned(e.target.checked)} />
          退職者を表示
        </label>
      </div>

      <div style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--md-sys-color-outline-variant)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'var(--md-sys-color-surface-container)', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>従業員番号</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>氏名</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>部署</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>肩書き</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>雇用形態</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>社用連絡先</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>状態</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>社員が登録されていません</td></tr>
            )}
            {filtered.map(e => (
              <tr
                key={e.id}
                onClick={() => router.push(`/admin/employees/${e.id}`)}
                style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', cursor: 'pointer' }}
              >
                <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>{e.employeeNumber}</td>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{e.lastName} {e.firstName}</td>
                <td style={{ padding: '12px 16px' }}>{e.department ?? '—'}</td>
                <td style={{ padding: '12px 16px' }}>{e.jobTitle ?? '—'}</td>
                <td style={{ padding: '12px 16px' }}>{e.employmentType ?? '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: 12 }}>
                  {e.workEmail && <div>{e.workEmail}</div>}
                  {e.workPhone && <div>{e.workPhone}</div>}
                  {!e.workEmail && !e.workPhone && '—'}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {e.resignDate
                    ? <span style={{ padding: '2px 8px', borderRadius: 12, background: 'rgba(211, 47, 47, 0.15)', color: '#ef5350', fontSize: 12 }}>退職</span>
                    : <span style={{ padding: '2px 8px', borderRadius: 12, background: 'rgba(46, 125, 50, 0.15)', color: '#66bb6a', fontSize: 12 }}>在籍</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
