'use client'

// アクセス解析タブの「パラメータ・キャンペーン」「設定」セクション
import { useState, useEffect, useCallback } from 'react'
import ChartCard from '@/components/charts/ChartCard'
import StatTable from '@/components/charts/StatTable'
import type { ParamStatRow, TrackingSiteItem, TrackingButtonItem, TrackingCampaignItem } from '@/lib/tracking-types'

const inputClass = 'text-xs px-3 py-2 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-transparent text-[var(--md-sys-color-on-surface)] outline-none focus:border-[var(--md-sys-color-primary,#4f8ef7)]'
const primaryBtn = 'text-xs px-3.5 py-2 rounded-full font-semibold bg-[var(--md-sys-color-primary,#374151)] text-[var(--md-sys-color-on-primary,#fff)] disabled:opacity-40 hover:opacity-90'

function CopyButton({ text, label = 'コピー' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="text-[10px] px-2 py-1 rounded-md border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high,#f0f0f0)] flex-shrink-0"
    >
      {copied ? '✓ コピー済み' : label}
    </button>
  )
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="text-[10px] p-2.5 rounded-lg overflow-x-auto bg-[var(--md-sys-color-surface-container-high,#f5f5f5)] text-[var(--md-sys-color-on-surface)]">
      {code}
    </pre>
  )
}

/* ─── パラメータ・キャンペーン ─── */

function ParamsCampaignsSection({ query }: { query: string }) {
  const [params, setParams] = useState<ParamStatRow[] | null>(null)
  const [paramQ, setParamQ] = useState('')
  const [cvOnly, setCvOnly] = useState(false)
  const [campaigns, setCampaigns] = useState<TrackingCampaignItem[] | null>(null)
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [paramRows, setParamRows] = useState([{ key: 'utm_source', value: '' }, { key: 'utm_medium', value: '' }, { key: 'utm_campaign', value: '' }])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setParams(null)
    fetch(`/api/admin/tracking/params?${query}`).then(r => r.ok ? r.json() : null).then(d => setParams(d?.params ?? [])).catch(() => setParams([]))
  }, [query])

  const loadCampaigns = useCallback(() => {
    fetch(`/api/admin/tracking/campaigns?${query}`).then(r => r.ok ? r.json() : null).then(d => setCampaigns(d?.campaigns ?? [])).catch(() => setCampaigns([]))
  }, [query])
  useEffect(() => { loadCampaigns() }, [loadCampaigns])

  const create = async () => {
    setCreating(true)
    setError(null)
    try {
      const paramObj = Object.fromEntries(paramRows.filter(r => r.key.trim() && r.value.trim()).map(r => [r.key.trim(), r.value.trim()]))
      const res = await fetch('/api/admin/tracking/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, baseUrl, params: paramObj }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? '発行に失敗しました')
      setName(''); setBaseUrl('')
      setParamRows([{ key: 'utm_source', value: '' }, { key: 'utm_medium', value: '' }, { key: 'utm_campaign', value: '' }])
      loadCampaigns()
    } catch (e) {
      setError(e instanceof Error ? e.message : '発行に失敗しました')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="space-y-4">
      <ChartCard title="URLパラメータ分析" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">自動検出された全パラメータ。ラストタッチCV = そのパラメータで流入したセッションのCV / ファーストタッチCV = CVした人の初回流入</span>}>
        {params === null ? (
          <p className="text-xs py-8 text-center text-[var(--md-sys-color-on-surface-variant)]">読み込み中…</p>
        ) : (() => {
          const kw = paramQ.trim().toLowerCase()
          const filtered = params.filter(p => {
            if (cvOnly && p.cvSessions <= 0) return false
            if (kw && !(`${p.key}=${p.value} ${p.topLanding ?? ''}`.toLowerCase().includes(kw))) return false
            return true
          })
          return (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <input value={paramQ} onChange={e => setParamQ(e.target.value)} placeholder="パラメータ・LPで検索…" className={`${inputClass} w-64`} />
                <button onClick={() => setCvOnly(v => !v)} className={`text-xs px-2.5 py-1.5 rounded-full ${cvOnly ? 'bg-[var(--md-sys-color-primary,#374151)] text-[var(--md-sys-color-on-primary,#fff)] font-semibold' : 'bg-[var(--md-sys-color-surface-container-high,#f0f0f0)] text-[var(--md-sys-color-on-surface-variant)]'}`}>CVありのみ</button>
              </div>
              <StatTable
                columns={[
                  { key: 'param', label: 'パラメータ', format: 'text' },
                  { key: 'sessions', label: 'セッション', format: 'count', align: 'right' },
                  { key: 'cvSessions', label: 'CV(ラスト)', format: 'count', align: 'right' },
                  { key: 'cvr', label: 'CVR', format: 'pct', align: 'right' },
                  { key: 'firstTouchCv', label: 'CV(ファースト)', format: 'count', align: 'right' },
                  { key: 'topLanding', label: '主要LP', format: 'text' },
                ]}
                rows={filtered.map(p => ({
                  param: `${p.key}=${p.value}`,
                  sessions: p.sessions,
                  cvSessions: p.cvSessions,
                  cvr: p.cvr,
                  firstTouchCv: p.firstTouchCv,
                  topLanding: p.topLanding ?? '—',
                }))}
                defaultSortKey="sessions"
                pageSize={100}
                emptyText="パラメータ付きのアクセスがまだありません"
              />
            </>
          )
        })()}
      </ChartCard>

      <ChartCard title="キャンペーンURLビルダー" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">計測用URLを発行し、成果を自動突合</span>}>
        <div className="space-y-2.5 mb-4">
          <div className="flex flex-wrap gap-2">
            <input value={name} onChange={e => setName(e.target.value)} placeholder="キャンペーン名（例: 7月Instagram広告）" className={`${inputClass} w-64`} />
            <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="ベースURL（例: https://example.com/lp）" className={`${inputClass} flex-1 min-w-[240px]`} />
          </div>
          {paramRows.map((row, i) => (
            <div key={i} className="flex gap-2">
              <input value={row.key} onChange={e => setParamRows(rows => rows.map((r, j) => j === i ? { ...r, key: e.target.value } : r))} placeholder="パラメータ名" className={`${inputClass} w-44`} />
              <input value={row.value} onChange={e => setParamRows(rows => rows.map((r, j) => j === i ? { ...r, value: e.target.value } : r))} placeholder="値" className={`${inputClass} w-56`} />
            </div>
          ))}
          <div className="flex items-center gap-3">
            <button onClick={create} disabled={creating || !name.trim() || !baseUrl.trim()} className={primaryBtn}>URLを発行</button>
            {error && <span className="text-[11px] text-[var(--md-sys-color-error,#dc2626)]">⚠ {error}</span>}
          </div>
        </div>

        {campaigns && campaigns.length > 0 && (
          <div className="space-y-2.5">
            {campaigns.map(c => (
              <div key={c.id} className="rounded-xl p-3 border border-[var(--md-sys-color-outline-variant)]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">{c.name}</span>
                  <span className="text-[10px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
                    セッション {c.sessions.toLocaleString()} ・ CV {c.conversions}（CVR {(c.cvr * 100).toFixed(1)}%）
                  </span>
                  <div className="ml-auto flex gap-1.5">
                    <CopyButton text={c.builtUrl} label="URLをコピー" />
                    <button
                      onClick={async () => { if (confirm(`「${c.name}」を削除しますか？`)) { await fetch(`/api/admin/tracking/campaigns/${c.id}`, { method: 'DELETE' }); loadCampaigns() } }}
                      className="text-[10px] px-2 py-1 rounded-md text-[var(--md-sys-color-error,#dc2626)] hover:bg-[var(--md-sys-color-surface-container-high,#f0f0f0)]"
                    >
                      削除
                    </button>
                  </div>
                </div>
                <p className="text-[10px] mt-1 break-all text-[var(--md-sys-color-on-surface-variant)]">{c.builtUrl}</p>
              </div>
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  )
}

/* ─── 設定（サイト・ボタン発行） ─── */

function SettingsSection() {
  const [sites, setSites] = useState<TrackingSiteItem[] | null>(null)
  const [buttons, setButtons] = useState<TrackingButtonItem[] | null>(null)
  const [siteName, setSiteName] = useState('')
  const [siteDomains, setSiteDomains] = useState('')
  const [btnSiteId, setBtnSiteId] = useState('')
  const [btnName, setBtnName] = useState('')
  const [btnKind, setBtnKind] = useState('tel')
  const [busy, setBusy] = useState(false)

  // サイトのインライン編集
  const [editSiteId, setEditSiteId] = useState<string | null>(null)
  const [editSiteName, setEditSiteName] = useState('')
  const [editSiteDomains, setEditSiteDomains] = useState('')

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://system.rcinc.jp'

  const load = useCallback(() => {
    fetch('/api/admin/tracking/sites').then(r => r.ok ? r.json() : null).then(d => setSites(d?.sites ?? [])).catch(() => setSites([]))
    fetch('/api/admin/tracking/buttons').then(r => r.ok ? r.json() : null).then(d => setButtons(d?.buttons ?? [])).catch(() => setButtons([]))
  }, [])
  useEffect(() => { load() }, [load])

  const createSite = async () => {
    setBusy(true)
    try {
      await fetch('/api/admin/tracking/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: siteName, domains: siteDomains.split(',').map(s => s.trim()).filter(Boolean) }),
      })
      setSiteName(''); setSiteDomains('')
      load()
    } finally { setBusy(false) }
  }

  const createButton = async () => {
    setBusy(true)
    try {
      await fetch('/api/admin/tracking/buttons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ siteId: btnSiteId, name: btnName, kind: btnKind }),
      })
      setBtnName('')
      load()
    } finally { setBusy(false) }
  }

  const startEditSite = (site: TrackingSiteItem) => {
    setEditSiteId(site.id)
    setEditSiteName(site.name)
    setEditSiteDomains(site.domains.join(', '))
  }

  const saveEditSite = async () => {
    if (!editSiteId || !editSiteName.trim()) return
    setBusy(true)
    try {
      await fetch(`/api/admin/tracking/sites/${editSiteId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editSiteName, domains: editSiteDomains.split(',').map(s => s.trim()).filter(Boolean) }),
      })
      setEditSiteId(null)
      load()
    } finally { setBusy(false) }
  }

  const deleteSite = async (site: TrackingSiteItem) => {
    if (!confirm(`計測サイト「${site.name}」を削除しますか？\n発行済みのタグ・ボタンIDは無効になります。`)) return
    await fetch(`/api/admin/tracking/sites/${site.id}`, { method: 'DELETE' })
    if (editSiteId === site.id) setEditSiteId(null)
    load()
  }

  return (
    <div className="space-y-4">
      <ChartCard title="計測サイト（スクリプトタグ発行）">
        <div className="flex flex-wrap gap-2 mb-4">
          <input value={siteName} onChange={e => setSiteName(e.target.value)} placeholder="サイト名（例: OPS銀座LP）" className={`${inputClass} w-56`} />
          <input value={siteDomains} onChange={e => setSiteDomains(e.target.value)} placeholder="許可ドメイン（カンマ区切り・空欄で全許可）" className={`${inputClass} flex-1 min-w-[240px]`} />
          <button onClick={createSite} disabled={busy || !siteName.trim()} className={primaryBtn}>サイトを登録</button>
        </div>

        {sites === null ? (
          <p className="text-xs py-4 text-center text-[var(--md-sys-color-on-surface-variant)]">読み込み中…</p>
        ) : sites.length === 0 ? (
          <p className="text-xs py-4 text-center text-[var(--md-sys-color-on-surface-variant)]">サイトを登録するとスクリプトタグが発行されます</p>
        ) : (
          <div className="space-y-3">
            {sites.map(site => {
              const tag = `<script src="${origin}/t.js" data-site="${site.siteKey}" async></script>`
              return (
                <div key={site.id} className="rounded-xl p-3.5 border border-[var(--md-sys-color-outline-variant)]">
                  {editSiteId === site.id ? (
                    <div className="flex flex-wrap gap-2 mb-3">
                      <input value={editSiteName} onChange={e => setEditSiteName(e.target.value)} placeholder="サイト名" className={`${inputClass} w-56`} />
                      <input value={editSiteDomains} onChange={e => setEditSiteDomains(e.target.value)} placeholder="許可ドメイン（カンマ区切り・空欄で全許可）" className={`${inputClass} flex-1 min-w-[240px]`} />
                      <button onClick={saveEditSite} disabled={busy || !editSiteName.trim()} className={primaryBtn}>保存</button>
                      <button onClick={() => setEditSiteId(null)} className="text-[10px] px-2 py-1 rounded-md border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)]">キャンセル</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">{site.name}</span>
                      {!site.isActive && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[rgba(239,68,68,0.12)] text-[#ef4444]">停止中</span>}
                      <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                        {site.domains.length > 0 ? site.domains.join(', ') : '全ドメイン許可'} ・ ボタン {site.buttonCount}個
                      </span>
                      <div className="ml-auto flex gap-1.5">
                        <CopyButton text={tag} label="タグをコピー" />
                        <button
                          onClick={() => startEditSite(site)}
                          className="text-[10px] px-2 py-1 rounded-md border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)]"
                        >
                          編集
                        </button>
                        <button
                          onClick={async () => { await fetch(`/api/admin/tracking/sites/${site.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !site.isActive }) }); load() }}
                          className="text-[10px] px-2 py-1 rounded-md border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)]"
                        >
                          {site.isActive ? '停止' : '再開'}
                        </button>
                        <button
                          onClick={() => deleteSite(site)}
                          className="text-[10px] px-2 py-1 rounded-md text-[var(--md-sys-color-error,#dc2626)] hover:bg-[var(--md-sys-color-surface-container-high,#f0f0f0)]"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  )}
                  <p className="text-[10px] mb-1 text-[var(--md-sys-color-on-surface-variant)]">このタグを計測したいサイトの &lt;head&gt; に貼り付けてください:</p>
                  <CodeBlock code={tag} />
                </div>
              )
            })}
          </div>
        )}
      </ChartCard>

      <ChartCard title="コンバージョンボタンID発行" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">電話・LINEなどメール以外の問い合わせをクリックで計測</span>}>
        <div className="flex flex-wrap gap-2 mb-4">
          <select value={btnSiteId} onChange={e => setBtnSiteId(e.target.value)} className={inputClass}>
            <option value="">サイトを選択…</option>
            {(sites ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input value={btnName} onChange={e => setBtnName(e.target.value)} placeholder="ボタン名（例: 電話発信ボタン ヘッダー）" className={`${inputClass} w-64`} />
          <select value={btnKind} onChange={e => setBtnKind(e.target.value)} className={inputClass}>
            <option value="tel">電話</option>
            <option value="line">LINE</option>
            <option value="mail">メール</option>
            <option value="other">その他</option>
          </select>
          <button onClick={createButton} disabled={busy || !btnSiteId || !btnName.trim()} className={primaryBtn}>IDを発行</button>
        </div>

        {buttons === null ? (
          <p className="text-xs py-4 text-center text-[var(--md-sys-color-on-surface-variant)]">読み込み中…</p>
        ) : buttons.length === 0 ? (
          <p className="text-xs py-4 text-center text-[var(--md-sys-color-on-surface-variant)]">ボタンIDを発行し、計測したいボタンに id 属性を付けてください</p>
        ) : (
          <div className="space-y-3">
            {buttons.map(b => (
              <div key={b.id} className="rounded-xl p-3.5 border border-[var(--md-sys-color-outline-variant)]">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className="text-sm">{b.kind === 'tel' ? '📞' : b.kind === 'line' ? '💬' : b.kind === 'mail' ? '✉️' : '🔘'}</span>
                  <span className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">{b.name}</span>
                  <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">{b.siteName}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full tabular-nums bg-[var(--md-sys-color-surface-container-high,#f0f0f0)] text-[var(--md-sys-color-on-surface-variant)]">
                    クリック {b.clickCount.toLocaleString()}回
                  </span>
                  <div className="ml-auto flex gap-1.5">
                    <CopyButton text={`id="${b.buttonKey}"`} label="IDをコピー" />
                    <button
                      onClick={async () => { if (confirm(`「${b.name}」を削除しますか？計測履歴は残ります。`)) { await fetch(`/api/admin/tracking/buttons/${b.id}`, { method: 'DELETE' }); load() } }}
                      className="text-[10px] px-2 py-1 rounded-md text-[var(--md-sys-color-error,#dc2626)] hover:bg-[var(--md-sys-color-surface-container-high,#f0f0f0)]"
                    >
                      削除
                    </button>
                  </div>
                </div>
                <CodeBlock code={`<a href="tel:0312345678" id="${b.buttonKey}">電話で問い合わせ</a>`} />
              </div>
            ))}
          </div>
        )}
      </ChartCard>
    </div>
  )
}

export default function TrackingSettingsSections({ section, query }: { section: 'params' | 'settings'; query: string }) {
  if (section === 'params') return <ParamsCampaignsSection query={query} />
  return <SettingsSection />
}
