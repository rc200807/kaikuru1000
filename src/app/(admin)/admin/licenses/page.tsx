'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'
import SummaryCard from '@/components/SummaryCard'
import SearchFilterBar from '@/components/SearchFilterBar'
import DataTable, { type Column } from '@/components/DataTable'
import Modal from '@/components/Modal'

type LicenseKey = {
  id: string
  key: string
  isUsed: boolean
  createdAt: string
  user: { id: string; name: string; email: string } | null
}

type GoogleConfig = {
  isConnected: boolean
  googleEmail: string | null
  spreadsheetId: string | null
  sheetName: string
} | null

export default function AdminLicensesPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [keys, setKeys] = useState<LicenseKey[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [newKeys, setNewKeys] = useState('')
  const [adding, setAdding] = useState(false)
  const [filterUsed, setFilterUsed] = useState<'' | 'used' | 'unused'>('')
  const [search, setSearch] = useState('')

  // Googleインポート
  const [googleConfig, setGoogleConfig] = useState<GoogleConfig>(null)
  const [importing, setImporting] = useState(false)

  // CSVインポート
  const csvFileInputRef = useRef<HTMLInputElement>(null)
  const [csvImporting, setCsvImporting] = useState(false)

  // 手動追加モーダル
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      const sessionUser = session.user as any
      if (sessionUser.role !== 'admin') { router.push('/'); return }
      fetchKeys()
      fetchGoogleConfig()
    }
  }, [status, session])

  function fetchKeys() {
    fetch('/api/license-keys').then(r => r.json()).then(data => {
      setKeys(Array.isArray(data) ? data : [])
      setLoading(false)
    })
  }

  function fetchGoogleConfig() {
    fetch('/api/admin/google-config')
      .then(r => r.json())
      .then(data => setGoogleConfig(data))
      .catch(() => {})
  }

  async function handleAddKeys(e: React.FormEvent) {
    e.preventDefault()
    const keyList = newKeys.split('\n').map(k => k.trim()).filter(k => k)
    if (keyList.length === 0) return

    setAdding(true)
    setMessage(null)
    const res = await fetch('/api/license-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keys: keyList }),
    })
    const data = await res.json()
    setAdding(false)

    if (data.created?.length > 0) {
      setMessage({ type: 'success', text: `${data.created.length}件のライセンスキーを追加しました${data.errors?.length > 0 ? `（${data.errors.length}件はエラー）` : ''}` })
      setNewKeys('')
      setShowAddModal(false)
      fetchKeys()
    } else {
      setMessage({ type: 'error', text: '追加に失敗しました（重複または無効なキーの可能性があります）' })
    }
  }

  async function handleImportFromSheets() {
    setImporting(true)
    setMessage(null)
    const res = await fetch('/api/admin/sync-licenses', { method: 'POST' })
    const data = await res.json()
    setImporting(false)

    if (res.ok && data.success) {
      setMessage({
        type: 'success',
        text: `インポート完了: ${data.created}件追加（${data.skipped}件は重複スキップ）`,
      })
      fetchKeys()
    } else {
      setMessage({ type: 'error', text: data.error || 'インポートに失敗しました' })
    }
  }

  function handleExportCSV() {
    window.location.href = '/api/license-keys/export'
  }

  async function handleImportCSV(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setCsvImporting(true)
    setMessage(null)

    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/license-keys/import', {
      method: 'POST',
      body: formData,
    })
    const data = await res.json()
    setCsvImporting(false)

    // ファイル入力をリセット
    if (csvFileInputRef.current) csvFileInputRef.current.value = ''

    if (res.ok && data.success) {
      setMessage({
        type: 'success',
        text: `CSVインポート完了: ${data.created}件追加（${data.skipped}件は重複スキップ）`,
      })
      fetchKeys()
    } else {
      setMessage({ type: 'error', text: data.error || 'CSVインポートに失敗しました' })
    }
  }

  function generateKey() {
    // 形式: KA + 大文字1文字 + 数字10桁 (例: KAZ9961583613)
    const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26))
    const digits = Math.floor(Math.random() * 10_000_000_000).toString().padStart(10, '0')
    return `KA${letter}${digits}`
  }

  function handleGenerateKeys(count: number) {
    const generated = Array.from({ length: count }, generateKey)
    setNewKeys(prev => prev ? prev + '\n' + generated.join('\n') : generated.join('\n'))
  }

  const filtered = keys.filter(k => {
    const matchSearch = !search || k.key.includes(search) || k.user?.name?.includes(search)
    const matchUsed = !filterUsed || (filterUsed === 'used' ? k.isUsed : !k.isUsed)
    return matchSearch && matchUsed
  })

  const unusedCount = keys.filter(k => !k.isUsed).length
  const usedCount = keys.filter(k => k.isUsed).length

  const columns: Column<LicenseKey>[] = [
    {
      key: 'key',
      header: 'ライセンスキー',
      render: (row) => (
        <code className="text-sm font-mono bg-[var(--md-sys-color-surface-container-high)] px-2 py-0.5 rounded-[var(--md-sys-shape-extra-small)] select-all">
          {row.key}
        </code>
      ),
    },
    {
      key: 'status',
      header: '状態',
      render: (row) => (
        <span className={`
          inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium
          ${row.isUsed
            ? 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]'
            : 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]'
          }
        `}>
          <span className={`w-1.5 h-1.5 rounded-full ${row.isUsed ? 'bg-[var(--md-sys-color-outline)]' : 'bg-[var(--status-completed-text)]'}`} />
          {row.isUsed ? '使用済み' : '未使用'}
        </span>
      ),
    },
    {
      key: 'user',
      header: '使用者',
      hideOnMobile: true,
      render: (row) => (
        <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
          {row.user ? row.user.name : '\u2014'}
        </span>
      ),
    },
    {
      key: 'createdAt',
      header: '発行日',
      hideOnMobile: true,
      sortable: true,
      sortValue: (row) => row.createdAt,
      render: (row) => (
        <span className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
          {format(new Date(row.createdAt), 'yyyy/M/d', { locale: ja })}
        </span>
      ),
    },
  ]

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  }

  return (
    <>
      <AppBar
        title="ライセンスキー管理"
        actions={
          <div className="flex items-center gap-2">
            {googleConfig?.isConnected && googleConfig?.spreadsheetId && (
              <Button
                variant="tonal"
                size="sm"
                loading={importing}
                onClick={handleImportFromSheets}
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                }
              >
                Sheets取込
              </Button>
            )}
            <input
              ref={csvFileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleImportCSV}
            />
            <Button
              variant="tonal"
              size="sm"
              loading={csvImporting}
              onClick={() => csvFileInputRef.current?.click()}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              }
            >
              CSV取込
            </Button>
            <Button
              variant="outlined"
              size="sm"
              onClick={handleExportCSV}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              }
            >
              エクスポート
            </Button>
            <Button
              variant="filled"
              size="sm"
              onClick={() => { setShowAddModal(true); setMessage(null) }}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              }
            >
              手動追加
            </Button>
          </div>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* メッセージ */}
        {message && (
          <MessageBanner
            severity={message.type}
            dismissible
            onDismiss={() => setMessage(null)}
          >
            {message.text}
          </MessageBanner>
        )}

        {/* Google連携バナー（未設定時） */}
        {googleConfig && (!googleConfig.isConnected || !googleConfig.spreadsheetId) && (
          <MessageBanner severity="info">
            {!googleConfig.isConnected
              ? 'Googleアカウントが未連携です。'
              : 'スプレッドシートが未設定です。'}
            {' '}
            <Link href="/admin/settings" className="underline font-medium hover:opacity-80">
              設定ページで設定する
            </Link>
          </MessageBanner>
        )}

        {/* サマリーカード */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <SummaryCard
            label="合計"
            value={keys.length}
            unit="件"
            accentColor="bg-[var(--portal-primary,#374151)]"
          />
          <SummaryCard
            label="未使用"
            value={unusedCount}
            unit="件"
            accentColor="bg-[var(--status-completed-text)]"
          />
          <SummaryCard
            label="使用済み"
            value={usedCount}
            unit="件"
            accentColor="bg-[var(--md-sys-color-outline)]"
          />
        </div>

        {/* 検索・フィルター */}
        <SearchFilterBar
          filters={[
            { key: 'search', label: '検索', type: 'text', placeholder: 'キー・氏名で検索...' },
            {
              key: 'filterUsed',
              label: '状態',
              type: 'select',
              options: [
                { value: 'unused', label: '未使用のみ' },
                { value: 'used', label: '使用済みのみ' },
              ],
            },
          ]}
          values={{ search, filterUsed }}
          onChange={(key, value) => {
            if (key === 'search') setSearch(value)
            if (key === 'filterUsed') setFilterUsed(value as any)
          }}
          onClear={() => { setSearch(''); setFilterUsed('') }}
        />

        {/* テーブル表示件数 */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
            {filtered.length}件表示
          </p>
        </div>

        {/* データテーブル */}
        <Card variant="elevated" padding="none">
          <DataTable
            columns={columns}
            data={filtered}
            rowKey={(row) => row.id}
            emptyTitle="該当するキーがありません"
            emptyDescription="検索条件を変更するか、新しいキーを追加してください"
          />
        </Card>
      </div>

      {/* 手動追加モーダル */}
      <Modal
        open={showAddModal}
        onClose={() => { setShowAddModal(false); setNewKeys('') }}
        title="ライセンスキー手動追加"
        size="md"
        footer={
          <>
            <Button variant="text" onClick={() => { setShowAddModal(false); setNewKeys('') }}>
              キャンセル
            </Button>
            <Button
              variant="filled"
              type="submit"
              disabled={!newKeys.trim()}
              loading={adding}
              onClick={() => {
                const fakeEvent = { preventDefault: () => {} } as React.FormEvent
                handleAddKeys(fakeEvent)
              }}
            >
              キーを追加
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* 自動生成ボタン */}
          <div>
            <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-2">
              自動生成
            </p>
            <div className="flex gap-2">
              {[5, 10, 20].map(n => (
                <Button
                  key={n}
                  variant="tonal"
                  size="sm"
                  onClick={() => handleGenerateKeys(n)}
                >
                  {n}件生成
                </Button>
              ))}
            </div>
          </div>

          {/* テキストエリア */}
          <TextField
            label="ライセンスキー"
            value={newKeys}
            onChange={setNewKeys}
            rows={6}
            placeholder={"1行に1つのキーを入力\nKAZ9961583613\nKAA1234567890"}
            helper="1行に1つのキーを入力してください"
          />
        </div>
      </Modal>
    </>
  )
}
