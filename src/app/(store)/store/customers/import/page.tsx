'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Button from '@/components/Button'
import Card from '@/components/Card'
import MessageBanner from '@/components/MessageBanner'

type RowError = { row: number; name?: string; message: string }
type ImportResult = {
  totalRows: number
  createdCount: number
  updatedCount: number
  errorCount: number
  errors: RowError[]
}

export default function StoreCustomerImportPage() {
  const { status } = useSession()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setUploading(true)
    setErrorMsg(null)
    setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/store/customers/import', { method: 'POST', body: fd })
    const data = await res.json().catch(() => ({}))
    setUploading(false)
    if (!res.ok) {
      setErrorMsg(data.error ?? 'アップロードに失敗しました')
      return
    }
    setResult(data as ImportResult)
    setFile(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  if (status !== 'authenticated') return null

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/store/customers" className="text-sm text-[var(--portal-primary)] hover:underline">← 顧客一覧に戻る</Link>
        <h1 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">顧客CSVインポート</h1>
      </div>

      <Card variant="elevated" padding="md">
        <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-2">1. テンプレートをダウンロード</h2>
        <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-3 leading-relaxed">
          以下の列を含むCSVファイルを準備してください（* は必須）。<br />
          <code className="text-[10px]">氏名* / フリガナ / メール / 電話* / 電話2 / 電話3 / 住所 / 顧客タイプ / 訪問頻度（月） / 内部メモ</code>
        </p>
        <a
          href="/api/store/customers/import"
          download="store-customers-template.csv"
          className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors"
        >
          ⬇ テンプレートCSVをダウンロード
        </a>
      </Card>

      <Card variant="elevated" padding="md">
        <form onSubmit={handleUpload}>
          <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">2. CSVをアップロード</h2>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-xs text-[var(--md-sys-color-on-surface-variant)] file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[var(--portal-primary)] file:text-white hover:file:opacity-90 mb-3"
          />
          <Button type="submit" disabled={!file || uploading} loading={uploading}>
            {uploading ? '取込中...' : 'インポート実行'}
          </Button>
          <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-3 leading-relaxed">
            ・新規顧客は自店舗（あなたのアカウント）に紐づきます。仮パスワードが自動生成されます。<br />
            ・メールアドレスが既存顧客と一致した場合は更新（空欄列はスキップ）。<br />
            ・顧客タイプは「訪問型」「宅配型」「通常買取」「アキクル」（または英語キー <code className="text-[10px]">visit/delivery/regular/akikuru</code>）。<br />
            ・必須項目（氏名・電話）が空の行はエラーとして報告されます。
          </p>
        </form>
      </Card>

      {errorMsg && <MessageBanner severity="error">{errorMsg}</MessageBanner>}

      {result && (
        <Card variant="elevated" padding="md">
          <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">取込結果</h2>
          <div className="grid grid-cols-4 gap-2 mb-3">
            <Stat label="合計行" value={result.totalRows} />
            <Stat label="新規" value={result.createdCount} tone="ok" />
            <Stat label="更新" value={result.updatedCount} tone="ok" />
            <Stat label="エラー" value={result.errorCount} tone={result.errorCount > 0 ? 'ng' : undefined} />
          </div>

          {result.errorCount === 0 && result.totalRows > 0 && (
            <MessageBanner severity="success">
              {result.createdCount}件新規登録・{result.updatedCount}件更新しました
            </MessageBanner>
          )}

          {result.errors.length > 0 && (
            <div className="rounded-lg border border-[var(--md-sys-color-outline-variant)] overflow-hidden mt-3">
              <table className="w-full text-xs">
                <thead className="bg-[var(--md-sys-color-surface-container-high)]">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-[var(--md-sys-color-on-surface-variant)] w-12">行</th>
                    <th className="px-3 py-2 text-left font-medium text-[var(--md-sys-color-on-surface-variant)] w-32">氏名</th>
                    <th className="px-3 py-2 text-left font-medium text-[var(--md-sys-color-on-surface-variant)]">エラー</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i} className="border-t border-[var(--md-sys-color-outline-variant)]">
                      <td className="px-3 py-2 font-mono">{e.row}</td>
                      <td className="px-3 py-2">{e.name ?? '—'}</td>
                      <td className="px-3 py-2 text-[var(--md-sys-color-error)]">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'ng' }) {
  const color = tone === 'ok' ? 'text-emerald-600' : tone === 'ng' ? 'text-[var(--md-sys-color-error)]' : 'text-[var(--md-sys-color-on-surface)]'
  return (
    <div className="rounded-lg bg-[var(--md-sys-color-surface-container-low)] border border-[var(--md-sys-color-outline-variant)] px-3 py-2 text-center">
      <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] mb-0.5">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  )
}
