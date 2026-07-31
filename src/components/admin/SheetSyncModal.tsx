'use client'

// Googleスプレッドシート双方向同期モーダル（店舗情報・運営者情報 共通）。
// スプレッドシートID/URL・シート名を設定し、「シートへ出力」「シートから取込」を実行する。
import { useEffect, useState } from 'react'

type SyncResult = {
  success: boolean
  message: string
  exported?: number
  url?: string
  totalRows?: number
  createdCount?: number
  updatedCount?: number
  errorCount?: number
  errors?: { row: number; key?: string; message: string }[]
}

type Props = {
  open: boolean
  onClose: () => void
  /** モーダルタイトル（例: 店舗情報のスプレッドシート同期） */
  title: string
  /** 設定・実行APIのベースパス（例: /api/admin/stores/sheet-sync） */
  apiBase: string
  /** 突合キーの表示名（例: 店舗コード / 運営者ID） */
  keyLabel: string
  /** 同期完了後に一覧を更新するコールバック */
  onSynced?: () => void
}

export default function SheetSyncModal({ open, onClose, title, apiBase, keyLabel, onSynced }: Props) {
  const [loading, setLoading] = useState(true)
  const [spreadsheetId, setSpreadsheetId] = useState('')
  const [sheetName, setSheetName] = useState('')
  const [serviceAccountEmail, setServiceAccountEmail] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState<'export' | 'import' | null>(null)
  const [savedMsg, setSavedMsg] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<SyncResult | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setError('')
    setResult(null)
    setSavedMsg('')
    fetch(apiBase)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data) {
          setSpreadsheetId(data.spreadsheetId ?? '')
          setSheetName(data.sheetName ?? '')
          setServiceAccountEmail(data.serviceAccountEmail ?? null)
        }
      })
      .finally(() => setLoading(false))
  }, [open, apiBase])

  if (!open) return null

  async function saveConfig(): Promise<boolean> {
    setSaving(true)
    setError('')
    setSavedMsg('')
    try {
      const res = await fetch(apiBase, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spreadsheetId, sheetName }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || '設定の保存に失敗しました')
        return false
      }
      // 正規化されたID（URL→ID変換後）を反映
      if (typeof data.spreadsheetId === 'string') setSpreadsheetId(data.spreadsheetId)
      if (typeof data.sheetName === 'string') setSheetName(data.sheetName)
      setSavedMsg('設定を保存しました')
      return true
    } catch {
      setError('設定の保存に失敗しました')
      return false
    } finally {
      setSaving(false)
    }
  }

  async function run(action: 'export' | 'import') {
    if (!spreadsheetId.trim()) {
      setError('スプレッドシートID（またはURL）を入力してください')
      return
    }
    setRunning(action)
    setError('')
    setResult(null)
    setSavedMsg('')
    try {
      // 実行前に現在の入力内容を保存（設定と実行のズレを防ぐ）
      const saved = await saveConfig()
      if (!saved) return
      setSavedMsg('')
      const res = await fetch(apiBase, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.message || data.error || '実行に失敗しました')
        if (data.errors) setResult(data)
        return
      }
      setResult(data)
      if (action === 'import' && ((data.createdCount ?? 0) > 0 || (data.updatedCount ?? 0) > 0)) {
        onSynced?.()
      }
    } catch {
      setError('実行に失敗しました')
    } finally {
      setRunning(null)
    }
  }

  const sheetUrl = spreadsheetId.trim()
    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId.trim()}/edit`
    : null

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8,
    border: '1px solid var(--md-sys-color-outline-variant)',
    background: 'var(--md-sys-color-surface-container-highest)',
    color: 'var(--md-sys-color-on-surface)', fontSize: 13,
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: 'var(--md-sys-color-on-surface-variant)' }

  return (
    <div
      onClick={() => { if (!running && !saving) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'var(--md-sys-color-surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 620, maxHeight: '88vh', overflowY: 'auto', color: 'var(--md-sys-color-on-surface)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h2>
          <button
            onClick={() => { if (!running && !saving) onClose() }}
            style={{ background: 'transparent', border: 'none', color: 'var(--md-sys-color-on-surface-variant)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}
            aria-label="閉じる"
          >×</button>
        </div>

        <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)', lineHeight: 1.7 }}>
          指定したGoogleスプレッドシートに全項目を出力し、シート上で編集した内容をシステムへ取り込めます。
          <strong>{keyLabel}</strong>で行を突合します（{keyLabel}が空欄の行は新規作成され、発行された{keyLabel}がシートに書き戻されます）。
        </p>

        {serviceAccountEmail ? (
          <div style={{ marginBottom: 16, padding: 12, background: 'var(--md-sys-color-surface-container-high)', borderRadius: 8, fontSize: 12, lineHeight: 1.7 }}>
            <strong>事前準備:</strong> 対象のスプレッドシートを、以下のサービスアカウントに<strong>編集者</strong>として共有してください。
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
              <code style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, background: 'var(--md-sys-color-surface-container-highest)', wordBreak: 'break-all' }}>
                {serviceAccountEmail}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(serviceAccountEmail).then(() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1600)
                  })
                }}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--md-sys-color-outline)', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                {copied ? '✓ コピーしました' : 'コピー'}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: 'rgba(251,191,36,0.15)', color: '#fbbf24', fontSize: 12, lineHeight: 1.6 }}>
            Googleサービスアカウントが未設定です（環境変数 GOOGLE_SHEETS_CLIENT_EMAIL）。設定されるまで同期は実行できません。
          </div>
        )}

        {loading ? (
          <p style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>読み込み中…</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12, marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>スプレッドシートID または URL</label>
                <input
                  type="text"
                  value={spreadsheetId}
                  onChange={e => setSpreadsheetId(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/xxxxx/edit または ID"
                  style={inputStyle}
                  disabled={!!running || saving}
                />
              </div>
              <div>
                <label style={labelStyle}>シート名（タブ名）</label>
                <input
                  type="text"
                  value={sheetName}
                  onChange={e => setSheetName(e.target.value)}
                  style={inputStyle}
                  disabled={!!running || saving}
                />
                <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>
                  シート（タブ）が存在しない場合、「シートへ出力」時に自動作成されます。ヘッダー行が無ければシステム側の項目で作成します。
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
              <button
                onClick={() => { void saveConfig() }}
                disabled={saving || !!running}
                style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13, fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}
              >
                {saving ? '保存中…' : '設定を保存'}
              </button>
              <button
                onClick={() => run('export')}
                disabled={!!running || saving || !serviceAccountEmail}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#4f8ef7', color: '#fff', fontSize: 13, fontWeight: 600, cursor: running ? 'wait' : 'pointer', opacity: !serviceAccountEmail ? 0.5 : 1 }}
              >
                {running === 'export' ? '出力中…' : '⬆ シートへ出力'}
              </button>
              <button
                onClick={() => run('import')}
                disabled={!!running || saving || !serviceAccountEmail}
                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontSize: 13, fontWeight: 600, cursor: running ? 'wait' : 'pointer', opacity: !serviceAccountEmail ? 0.5 : 1 }}
              >
                {running === 'import' ? '取込中…' : '⬇ シートから取込'}
              </button>
              {sheetUrl && (
                <a
                  href={sheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12, color: '#4f8ef7', textDecoration: 'none', marginLeft: 'auto' }}
                >
                  シートを開く ↗
                </a>
              )}
            </div>

            {savedMsg && (
              <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(74,222,128,0.15)', color: '#4ade80', fontSize: 12 }}>
                {savedMsg}
              </div>
            )}
            {error && (
              <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: 'rgba(248,113,113,0.15)', color: '#f87171', fontSize: 12, lineHeight: 1.5, wordBreak: 'break-all' }}>
                {error}
              </div>
            )}

            {result && (
              <div style={{ marginTop: 4 }}>
                <div style={{ padding: '10px 14px', borderRadius: 8, background: result.success ? 'rgba(74,222,128,0.15)' : 'rgba(251,191,36,0.15)', color: result.success ? '#4ade80' : '#fbbf24', fontSize: 13, marginBottom: 10 }}>
                  {result.success ? '✓ ' : ''}{result.message}
                </div>
                {typeof result.createdCount === 'number' && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
                    <div style={{ padding: '10px 8px', borderRadius: 8, background: 'var(--md-sys-color-surface-container-high)', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>新規作成</div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{result.createdCount}</div>
                    </div>
                    <div style={{ padding: '10px 8px', borderRadius: 8, background: 'var(--md-sys-color-surface-container-high)', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>更新</div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>{result.updatedCount ?? 0}</div>
                    </div>
                    <div style={{ padding: '10px 8px', borderRadius: 8, background: 'var(--md-sys-color-surface-container-high)', textAlign: 'center' }}>
                      <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>エラー</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: (result.errorCount ?? 0) > 0 ? '#f87171' : undefined }}>{result.errorCount ?? 0}</div>
                    </div>
                  </div>
                )}
                {result.errors && result.errors.length > 0 && (
                  <div style={{ maxHeight: 180, overflowY: 'auto', border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>エラー詳細:</div>
                    {result.errors.map((e, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#f87171', marginBottom: 4 }}>
                        行 {e.row}{e.key ? `（${e.key}）` : ''}: {e.message}
                      </div>
                    ))}
                  </div>
                )}
                {result.url && (
                  <div style={{ marginTop: 8 }}>
                    <a href={result.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#4f8ef7', textDecoration: 'none' }}>
                      出力先のスプレッドシートを開く ↗
                    </a>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
