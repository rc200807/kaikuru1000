'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

type KeyRow = {
  id: string
  key: string
  isUsed: boolean
  startDate: string | null
  endDate: string | null
  createdAt: string
  user: {
    id: string
    name: string
    email: string | null
    phone: string
    registeredAt: string
  } | null
}

type Response = {
  total: number
  used: number
  unused: number
  keys: KeyRow[]
}

type ImportResult = {
  totalRows: number
  updatedCount: number
  errorCount: number
  errors: { row: number; licenseKey?: string; message: string }[]
}

export default function PartnerLicenseKeysPage() {
  const { status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<Response | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'used' | 'unused'>('all')
  const [search, setSearch] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  // CSVインポート state
  const [importOpen, setImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importError, setImportError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/partner/login')
  }, [status, router])

  function loadKeys() {
    return fetch('/api/partner/license-keys')
      .then(r => r.ok ? r.json() : null)
      .then(setData)
  }

  useEffect(() => {
    if (status !== 'authenticated') return
    loadKeys().finally(() => setLoading(false))
  }, [status])

  async function handleImport(e: React.FormEvent) {
    e.preventDefault()
    if (!importFile) return
    setImporting(true)
    setImportError('')
    setImportResult(null)
    try {
      const fd = new FormData()
      fd.append('file', importFile)
      const res = await fetch('/api/partner/license-keys/import', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setImportError(data.error ?? 'インポートに失敗しました')
        return
      }
      setImportResult(data as ImportResult)
      if (data.updatedCount > 0) loadKeys()
      setImportFile(null)
    } finally {
      setImporting(false)
    }
  }

  const filtered = useMemo(() => {
    if (!data) return []
    let list = data.keys
    if (filter === 'used') list = list.filter(k => k.isUsed)
    else if (filter === 'unused') list = list.filter(k => !k.isUsed)
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter(k =>
        [k.key, k.user?.name ?? '', k.user?.email ?? '', k.user?.phone ?? '']
          .join(' ').toLowerCase().includes(q)
      )
    }
    return list
  }, [data, filter, search])

  function copy(text: string) {
    navigator.clipboard.writeText(text)
    setCopiedKey(text)
    setTimeout(() => setCopiedKey(null), 1500)
  }

  if (status !== 'authenticated') return null

  return (
    <div className="px-6 py-8 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-1 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold mb-1">ライセンスキー一覧</h1>
          <p className="text-sm text-[#a3a3a3] mb-6">
            本部が発行済みのライセンスキー（使用済み・未使用を含む全件）
          </p>
        </div>
        <button
          onClick={() => { setImportResult(null); setImportError(''); setImportFile(null); setImportOpen(true) }}
          className="px-4 py-2 rounded-md bg-[#1f1f1f] hover:bg-[#262626] text-sm border border-[rgba(255,255,255,0.08)]"
        >
          ⬆ CSVインポート（開始日/終了日）
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[#a3a3a3]">読み込み中…</p>
      ) : !data ? (
        <p className="text-sm text-rose-400">読み込みに失敗しました</p>
      ) : (
        <>
          {/* サマリ */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-xl px-4 py-3 bg-[#141414] border border-[rgba(255,255,255,0.06)]">
              <p className="text-[10px] uppercase tracking-wide text-[#a3a3a3] font-bold">合計</p>
              <p className="text-xl font-bold mt-1">{data.total}</p>
            </div>
            <div className="rounded-xl px-4 py-3 bg-emerald-500/10 border border-emerald-500/20">
              <p className="text-[10px] uppercase tracking-wide text-emerald-400 font-bold">使用済み</p>
              <p className="text-xl font-bold text-emerald-400 mt-1">{data.used}</p>
            </div>
            <div className="rounded-xl px-4 py-3 bg-amber-500/10 border border-amber-500/20">
              <p className="text-[10px] uppercase tracking-wide text-amber-400 font-bold">未使用</p>
              <p className="text-xl font-bold text-amber-400 mt-1">{data.unused}</p>
            </div>
          </div>

          {/* フィルタ + 検索 */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex gap-2">
              {([
                { v: 'all', label: 'すべて' },
                { v: 'used', label: '使用済み' },
                { v: 'unused', label: '未使用' },
              ] as const).map(t => (
                <button
                  key={t.v}
                  onClick={() => setFilter(t.v)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    filter === t.v
                      ? 'bg-white text-black'
                      : 'bg-[#141414] text-[#a3a3a3] hover:bg-[#1a1a1a]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <input
              type="search"
              placeholder="キー・顧客名・連絡先で検索"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-[200px] max-w-md px-3 py-2 rounded-md bg-[#141414] border border-[rgba(255,255,255,0.08)] text-sm"
            />
          </div>

          {/* テーブル */}
          <div className="rounded-2xl border border-[rgba(255,255,255,0.06)] overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="bg-[#141414] text-[#a3a3a3]">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">ライセンスキー</th>
                  <th className="px-3 py-2 text-left font-semibold w-24">状態</th>
                  <th className="px-3 py-2 text-left font-semibold w-28">開始日</th>
                  <th className="px-3 py-2 text-left font-semibold w-28">終了日</th>
                  <th className="px-3 py-2 text-left font-semibold w-32">発行日</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={5} className="px-3 py-8 text-center text-xs text-[#666]">該当するキーがありません</td></tr>
                ) : filtered.map(k => (
                  <tr key={k.id} className="border-t border-[rgba(255,255,255,0.06)]">
                    <td className="px-3 py-2">
                      <button
                        onClick={() => copy(k.key)}
                        title="クリックでコピー"
                        className="font-mono text-xs hover:text-amber-300"
                      >
                        {k.key}
                      </button>
                      {copiedKey === k.key && <span className="ml-2 text-[10px] text-emerald-400">✓ コピー済み</span>}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        k.endDate
                          ? 'bg-rose-500/15 text-rose-300'
                          : k.startDate
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : k.isUsed
                          ? 'bg-blue-500/15 text-blue-300'
                          : 'bg-amber-500/15 text-amber-300'
                      }`}>
                        {k.endDate ? '終了' : k.startDate ? '稼働中' : k.isUsed ? '登録済' : '未使用'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-[#a3a3a3]">
                      {k.startDate ? format(new Date(k.startDate), 'yyyy/M/d', { locale: ja }) : <span className="text-[#666]">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-[#a3a3a3]">
                      {k.endDate ? format(new Date(k.endDate), 'yyyy/M/d', { locale: ja }) : <span className="text-[#666]">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-[#a3a3a3]">
                      {format(new Date(k.createdAt), 'yyyy/M/d', { locale: ja })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* CSVインポートモーダル */}
      {importOpen && (
        <div
          onClick={() => !importing && setImportOpen(false)}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-[#0f0f0f] border border-[rgba(255,255,255,0.06)] rounded-2xl p-6 w-full max-w-xl max-h-[85vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-bold">ライセンスキーCSVインポート</h2>
              <button onClick={() => !importing && setImportOpen(false)} className="text-2xl text-[#a3a3a3] hover:text-white leading-none">×</button>
            </div>
            <p className="text-xs text-[#a3a3a3] mb-4 leading-relaxed">
              ライセンスキーをキーに、開始日 / 終了日 を一括更新します。<br />
              列: <code>ライセンスキー*</code> / <code>開始日</code> / <code>終了日</code>（日付は <code>YYYY-MM-DD</code>）
            </p>
            <a
              href="/api/partner/license-keys/import"
              download="license-keys-template.csv"
              className="inline-block mb-4 px-4 py-2 rounded-md bg-[#1f1f1f] hover:bg-[#262626] text-xs border border-[rgba(255,255,255,0.08)]"
            >
              ⬇ サンプルCSVをダウンロード
            </a>

            <form onSubmit={handleImport}>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={e => setImportFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-[#a3a3a3] file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:bg-[#1f1f1f] file:text-white hover:file:bg-[#262626] mb-4"
              />
              <button
                type="submit"
                disabled={!importFile || importing}
                className="px-4 py-2 rounded-md bg-white text-black text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {importing ? '取込中…' : 'インポート実行'}
              </button>
            </form>

            {importError && (
              <div className="mt-4 rounded-md p-3 text-sm bg-rose-500/10 text-rose-300 border border-rose-500/30">
                {importError}
              </div>
            )}

            {importResult && (
              <div className="mt-4 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md bg-[#141414] border border-[rgba(255,255,255,0.06)] px-3 py-2 text-center">
                    <div className="text-[10px] text-[#666]">合計行</div>
                    <div className="text-lg font-bold">{importResult.totalRows}</div>
                  </div>
                  <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-center">
                    <div className="text-[10px] text-emerald-400">更新</div>
                    <div className="text-lg font-bold text-emerald-300">{importResult.updatedCount}</div>
                  </div>
                  <div className={`rounded-md px-3 py-2 text-center border ${importResult.errorCount > 0 ? 'bg-rose-500/10 border-rose-500/20' : 'bg-[#141414] border-[rgba(255,255,255,0.06)]'}`}>
                    <div className={`text-[10px] ${importResult.errorCount > 0 ? 'text-rose-400' : 'text-[#666]'}`}>エラー</div>
                    <div className={`text-lg font-bold ${importResult.errorCount > 0 ? 'text-rose-300' : ''}`}>{importResult.errorCount}</div>
                  </div>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="rounded-md border border-[rgba(255,255,255,0.06)] overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-[#141414] text-[#a3a3a3]"><tr>
                        <th className="px-3 py-2 text-left font-semibold w-12">行</th>
                        <th className="px-3 py-2 text-left font-semibold w-44">ライセンスキー</th>
                        <th className="px-3 py-2 text-left font-semibold">エラー</th>
                      </tr></thead>
                      <tbody>
                        {importResult.errors.map((e, i) => (
                          <tr key={i} className="border-t border-[rgba(255,255,255,0.06)]">
                            <td className="px-3 py-2 font-mono">{e.row}</td>
                            <td className="px-3 py-2 font-mono">{e.licenseKey ?? '—'}</td>
                            <td className="px-3 py-2 text-rose-300">{e.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
