'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type RowError = { row: number; licenseKey?: string; message: string }
type ImportResult = {
  totalRows: number
  createdCount: number
  updatedCount: number
  errorCount: number
  errors: RowError[]
}

export default function PartnerCustomerImportPage() {
  const { status } = useSession()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/partner/login')
  }, [status, router])

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    setUploading(true)
    setErrorMsg(null)
    setResult(null)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/partner/customers/import', { method: 'POST', body: fd })
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
    <div className="px-6 py-8 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/partner/customers" className="text-xs text-[#a3a3a3] hover:text-white">← 顧客一覧に戻る</Link>
      </div>
      <h1 className="text-2xl font-bold mb-1">CSV インポート</h1>
      <p className="text-sm text-[#a3a3a3] mb-6">ライセンスキーをキーに、顧客情報を一括で新規登録／更新します。</p>

      <section className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#0f0f0f] p-5 mb-6">
        <h2 className="text-sm font-semibold mb-2">1. テンプレートをダウンロード</h2>
        <p className="text-xs text-[#a3a3a3] mb-3">
          列：<code>ライセンスキー*</code> / <code>姓*</code> / <code>名*</code> / <code>姓フリガナ</code> / <code>名フリガナ</code> / <code>メール</code> / <code>電話</code> / <code>住所</code>（旧形式の「氏名 / フリガナ」列も取込可）
        </p>
        <a
          href="/api/partner/customers/import"
          className="inline-flex items-center px-4 py-2 rounded-md bg-[#1f1f1f] hover:bg-[#262626] text-sm border border-[rgba(255,255,255,0.08)]"
        >
          テンプレート CSV をダウンロード
        </a>
      </section>

      <form onSubmit={handleUpload} className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#0f0f0f] p-5 mb-6">
        <h2 className="text-sm font-semibold mb-3">2. CSV をアップロード</h2>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-[#a3a3a3] file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:bg-[#1f1f1f] file:text-white hover:file:bg-[#262626] mb-4"
        />
        <button
          type="submit"
          disabled={!file || uploading}
          className="px-4 py-2 rounded-md bg-white text-black text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {uploading ? '取込中…' : 'インポート実行'}
        </button>
        <p className="text-[11px] text-[#666] mt-3">
          ・ライセンスキー未使用の行は新規顧客として登録（仮パスワード自動生成）<br />
          ・既存顧客はライセンスキーで照合して更新（空欄列はスキップ）<br />
          ・存在しないライセンスキーや必須欠落の行はエラーとして報告
        </p>
      </form>

      {errorMsg && (
        <div className="rounded-md p-3 mb-4 text-sm bg-red-500/10 text-red-300 border border-red-500/30">
          {errorMsg}
        </div>
      )}

      {result && (
        <section className="rounded-2xl border border-[rgba(255,255,255,0.06)] bg-[#0f0f0f] p-5">
          <h2 className="text-sm font-semibold mb-3">取込結果</h2>
          <div className="grid grid-cols-4 gap-3 mb-4">
            <Stat label="合計行" value={result.totalRows} />
            <Stat label="新規" value={result.createdCount} tone="ok" />
            <Stat label="更新" value={result.updatedCount} tone="ok" />
            <Stat label="エラー" value={result.errorCount} tone={result.errorCount > 0 ? 'ng' : undefined} />
          </div>
          {result.errors.length > 0 && (
            <div className="rounded-md border border-[rgba(255,255,255,0.06)] overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-[#141414] text-[#a3a3a3]">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold w-16">行</th>
                    <th className="px-3 py-2 text-left font-semibold w-56">ライセンスキー</th>
                    <th className="px-3 py-2 text-left font-semibold">エラー</th>
                  </tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i} className="border-t border-[rgba(255,255,255,0.06)]">
                      <td className="px-3 py-2 font-mono">{e.row}</td>
                      <td className="px-3 py-2 font-mono">{e.licenseKey ?? '—'}</td>
                      <td className="px-3 py-2 text-red-300">{e.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'ok' | 'ng' }) {
  const color = tone === 'ok' ? 'text-emerald-300' : tone === 'ng' ? 'text-red-300' : 'text-[#ededed]'
  return (
    <div className="rounded-md bg-[#141414] border border-[rgba(255,255,255,0.06)] px-3 py-2">
      <div className="text-[10px] text-[#666] mb-0.5">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  )
}
