'use client'

// 8番目のタブ「AI分析」: 週次ダイジェスト / 店舗不調予兆 / テキストマイニング / RFM / What-if / 経営レポート
import { useState, useEffect } from 'react'
import ChartCard from '@/components/charts/ChartCard'
import DonutChart from '@/components/charts/DonutChart'
import HBarRanking from '@/components/charts/HBarRanking'
import { fmtYen, fmtNum, fmtPct } from '@/lib/analytics/format'
import type {
  ReportResult, StoreAlertsResult, TextMiningResult, RfmResult, AiInsightItem,
} from '@/lib/analytics/types'
import type { WhatIfBase, WhatIfResult, WhatIfChange } from '@/lib/analytics/stats'
import { useAiPost, AiItemList, AiResultFooter, AiLoadingSkeleton, AiErrorNote, SparkleIcon, queryToParams, SEVERITY_STYLE } from './aiShared'

/* ─── レポート共通ビュー（週次ダイジェスト/経営レポートで共用） ─── */

function reportToMarkdown(r: ReportResult): string {
  const lines: string[] = [`# ${r.title}`, '', r.summary, '']
  for (const s of r.sections) {
    lines.push(`## ${s.heading}`, '', s.body, '')
    for (const b of s.bullets) lines.push(`- ${b}`)
    if (s.bullets.length > 0) lines.push('')
  }
  if (r.risks.length > 0) {
    lines.push('## リスク・懸念', '')
    for (const x of r.risks) lines.push(`- ⚠ ${x}`)
    lines.push('')
  }
  if (r.nextActions.length > 0) {
    lines.push('## 次の重点アクション', '')
    for (const x of r.nextActions) lines.push(`- [ ] ${x}`)
  }
  return lines.join('\n')
}

function ReportView({ report }: { report: ReportResult }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(reportToMarkdown(report))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  const download = () => {
    const blob = new Blob([reportToMarkdown(report)], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${report.title.replace(/[\\/:*?"<>|\s]+/g, '_')}.md`
    a.click()
    URL.revokeObjectURL(url)
  }
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">{report.title}</h4>
          <p className="text-xs mt-1.5 leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">{report.summary}</p>
        </div>
        <div className="flex gap-1.5 flex-shrink-0 ml-auto">
          <button onClick={copy} className="text-[10px] px-2 py-1 rounded-md border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high,#f0f0f0)]">
            {copied ? '✓ コピー済み' : 'Markdownコピー'}
          </button>
          <button onClick={download} className="text-[10px] px-2 py-1 rounded-md border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high,#f0f0f0)]">
            .mdダウンロード
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {report.sections.map((s, i) => (
          <div key={i} className="rounded-xl p-3.5 bg-[var(--md-sys-color-surface-container-high,#f7f7f7)]">
            <p className="text-xs font-bold mb-1.5 text-[var(--md-sys-color-on-surface)]">{s.heading}</p>
            <p className="text-[11px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">{s.body}</p>
            {s.bullets.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {s.bullets.map((b, j) => (
                  <li key={j} className="text-[11px] pl-3 relative text-[var(--md-sys-color-on-surface)]">
                    <span className="absolute left-0">・</span>{b}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
      {(report.risks.length > 0 || report.nextActions.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {report.risks.length > 0 && (
            <div className="rounded-xl p-3.5" style={{ background: 'rgba(239,68,68,0.07)' }}>
              <p className="text-xs font-bold mb-1.5" style={{ color: '#ef4444' }}>⚠ リスク・懸念</p>
              <ul className="space-y-1">
                {report.risks.map((r, i) => <li key={i} className="text-[11px] text-[var(--md-sys-color-on-surface)]">・{r}</li>)}
              </ul>
            </div>
          )}
          {report.nextActions.length > 0 && (
            <div className="rounded-xl p-3.5" style={{ background: 'rgba(34,197,94,0.07)' }}>
              <p className="text-xs font-bold mb-1.5" style={{ color: '#16a34a' }}>✓ 次の重点アクション</p>
              <ul className="space-y-1">
                {report.nextActions.map((a, i) => <li key={i} className="text-[11px] text-[var(--md-sys-color-on-surface)]">・{a}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── B1 週次AIダイジェスト（lazy自動生成 + 履歴） ─── */

function WeeklyDigestSection() {
  const ai = useAiPost<ReportResult>('weekly-digest')
  const [history, setHistory] = useState<{ id: string; from: string | null; to: string | null; content: ReportResult; generatedAt: string }[]>([])
  const [selected, setSelected] = useState<ReportResult | null>(null)

  useEffect(() => {
    // タブを開いたら先週分をlazy生成（キャッシュ済みなら即返る）+ 履歴取得
    ai.generate({})
    fetch('/api/admin/analytics/ai/weekly-digest')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.history) setHistory(d.history) })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const shown = selected ?? ai.content

  return (
    <ChartCard
      title="📅 週次AIダイジェスト"
      aside={history.length > 1 && (
        <select
          onChange={e => {
            const h = history.find(x => x.id === e.target.value)
            setSelected(h ? h.content : null)
          }}
          className="text-[10px] rounded-md px-1.5 py-1 border border-[var(--md-sys-color-outline-variant)] bg-transparent text-[var(--md-sys-color-on-surface-variant)]"
        >
          <option value="">最新（先週分）</option>
          {history.map(h => <option key={h.id} value={h.id}>{h.from ?? h.generatedAt.slice(0, 10)} の週</option>)}
        </select>
      )}
    >
      {ai.loading && !shown && <AiLoadingSkeleton label="先週分のダイジェストを生成しています…" />}
      {ai.error && <AiErrorNote message={ai.error} />}
      {shown && <ReportView report={shown} />}
      {!selected && ai.content && <AiResultFooter meta={ai.meta} loading={ai.loading} onRegenerate={() => ai.generate({}, true)} />}
    </ChartCard>
  )
}

/* ─── A3 店舗不調予兆 ─── */

function StoreAlertsSection() {
  const ai = useAiPost<StoreAlertsResult>('store-alerts')
  return (
    <ChartCard title="🚨 店舗不調予兆アラート" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">直近4週 vs その前4週</span>}>
      {!ai.content && !ai.loading && !ai.error && (
        <button onClick={() => ai.generate({})} className="text-xs px-3.5 py-1.5 rounded-full font-semibold bg-[var(--md-sys-color-primary,#374151)] text-[var(--md-sys-color-on-primary,#fff)] hover:opacity-90">
          ✨ 失速店舗をスキャン
        </button>
      )}
      {ai.loading && <AiLoadingSkeleton label="全店舗のトレンドを比較しています…" />}
      {ai.error && <AiErrorNote message={ai.error} />}
      {ai.content && !ai.loading && (
        <div className="space-y-3">
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{ai.content.summary}</p>
          {ai.content.alerts.map((a, i) => {
            const style = SEVERITY_STYLE[a.severity]
            return (
              <div key={i} className="rounded-xl p-3.5 border border-[var(--md-sys-color-outline-variant)]">
                <div className="flex items-center gap-2 mb-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px] font-bold" style={{ background: style.bg, color: style.fg }}>!</span>
                  <p className="text-xs font-bold text-[var(--md-sys-color-on-surface)]">{a.store}</p>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
                  {a.metrics.map(m => (
                    <span key={m.name} className="text-[10px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
                      {m.name}: {m.name === '買取金額' ? fmtYen(m.recent) : fmtNum(m.recent)}
                      <span style={{ color: m.changePercent < 0 ? '#ef4444' : '#22c55e' }} className="ml-1 font-semibold">
                        {m.changePercent >= 0 ? '+' : ''}{m.changePercent.toFixed(0)}%
                      </span>
                    </span>
                  ))}
                </div>
                {a.hypothesis && <p className="text-[11px] leading-relaxed text-[var(--md-sys-color-on-surface-variant)]">💭 {a.hypothesis}</p>}
                {a.action && <p className="text-[11px] mt-1 text-[var(--md-sys-color-on-surface)]">→ {a.action}</p>}
              </div>
            )
          })}
          <AiResultFooter meta={ai.meta} loading={ai.loading} onRegenerate={() => ai.generate({}, true)} />
        </div>
      )}
    </ChartCard>
  )
}

/* ─── C1 テキストマイニング ─── */

function TextMiningSection({ query }: { query: string }) {
  const ai = useAiPost<TextMiningResult>('text-mining')
  useEffect(() => { ai.reset() }, [query]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ChartCard title="💬 テキストマイニング（VOC分析）" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">問い合わせ・案件メモ・買取相談の自由記述</span>}>
      {!ai.content && !ai.loading && !ai.error && (
        <button onClick={() => ai.generate({ params: queryToParams(query) })} className="text-xs px-3.5 py-1.5 rounded-full font-semibold bg-[var(--md-sys-color-primary,#374151)] text-[var(--md-sys-color-on-primary,#fff)] hover:opacity-90">
          ✨ テキストを分析
        </button>
      )}
      {ai.loading && <AiLoadingSkeleton label="自由記述テキストを読み込んで分類しています…" />}
      {ai.error && <AiErrorNote message={ai.error} />}
      {ai.content && !ai.loading && (
        <div className="space-y-4">
          <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">分析対象: {ai.content.analyzedCount}件のテキスト</p>
          {ai.content.themes.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <HBarRanking items={ai.content.themes.map(t => ({ name: t.name, value: t.count }))} showRank={false} />
              <div className="space-y-2.5">
                {ai.content.themes.slice(0, 4).map((t, i) => (
                  <div key={i}>
                    <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">{t.name}（{t.count}件）</p>
                    <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{t.insight}</p>
                    {t.examples.length > 0 && (
                      <p className="text-[10px] mt-0.5 italic text-[var(--md-sys-color-on-surface-variant)]">例: {t.examples[0]}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {ai.content.lostReasons.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold mb-1.5 text-[var(--md-sys-color-on-surface-variant)]">📉 失注理由の分析</p>
              <div className="space-y-1.5">
                {ai.content.lostReasons.map((r, i) => (
                  <p key={i} className="text-[11px] text-[var(--md-sys-color-on-surface)]">
                    <span className="font-semibold">{r.name}（{r.count}件）</span>
                    <span className="text-[var(--md-sys-color-on-surface-variant)]"> — {r.detail}</span>
                  </p>
                ))}
              </div>
            </div>
          )}
          {ai.content.insights.length > 0 && (
            <AiItemList items={ai.content.insights.map(x => ({ title: x, detail: '', severity: 'info' as const }))} />
          )}
          <AiResultFooter meta={ai.meta} loading={ai.loading} onRegenerate={() => ai.generate({ params: queryToParams(query) }, true)} />
        </div>
      )}
    </ChartCard>
  )
}

/* ─── C2 顧客セグメントRFM ─── */

const RFM_COLORS: Record<string, string> = {
  vip: '#f59e0b', stable: '#34d399', growing: '#4f8ef7', at_risk: '#f87171', dormant: '#94a3b8', new: '#a78bfa',
}

function RfmSection({ query }: { query: string }) {
  const ai = useAiPost<RfmResult>('rfm')
  return (
    <ChartCard title="👥 顧客セグメントAI分析（RFM）" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">最終訪問 × 頻度 × 累計金額（全期間）</span>}>
      {!ai.content && !ai.loading && !ai.error && (
        <button onClick={() => ai.generate({ params: queryToParams(query) })} className="text-xs px-3.5 py-1.5 rounded-full font-semibold bg-[var(--md-sys-color-primary,#374151)] text-[var(--md-sys-color-on-primary,#fff)] hover:opacity-90">
          ✨ セグメント分析
        </button>
      )}
      {ai.loading && <AiLoadingSkeleton label="全顧客を分類しています…" />}
      {ai.error && <AiErrorNote message={ai.error} />}
      {ai.content && !ai.loading && (
        <div className="space-y-4">
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{ai.content.summary}</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <DonutChart items={ai.content.segments.map(s => ({ name: s.label, value: s.count, color: RFM_COLORS[s.key] }))} height={180} />
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[300px]">
                <thead>
                  <tr className="border-b border-[var(--md-sys-color-outline-variant)] text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                    <th className="text-left py-1.5">セグメント</th>
                    <th className="text-right py-1.5">人数</th>
                    <th className="text-right py-1.5">累計買取額</th>
                    <th className="text-right py-1.5">平均訪問</th>
                  </tr>
                </thead>
                <tbody>
                  {ai.content.segments.map(s => (
                    <tr key={s.key} className="border-b border-[var(--md-sys-color-outline-variant)] last:border-0">
                      <td className="py-1.5">
                        <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: RFM_COLORS[s.key] }} />
                        <span className="text-[var(--md-sys-color-on-surface)]">{s.label}</span>
                      </td>
                      <td className="text-right tabular-nums py-1.5 text-[var(--md-sys-color-on-surface)]">{fmtNum(s.count)}</td>
                      <td className="text-right tabular-nums py-1.5 text-[var(--md-sys-color-on-surface)]">{fmtYen(s.totalAmount)}</td>
                      <td className="text-right tabular-nums py-1.5 text-[var(--md-sys-color-on-surface)]">{s.avgFrequency}回</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="space-y-1.5">
            {ai.content.segments.filter(s => s.advice).map(s => (
              <p key={s.key} className="text-[11px] text-[var(--md-sys-color-on-surface)]">
                <span className="font-semibold" style={{ color: RFM_COLORS[s.key] }}>{s.label}:</span>
                <span className="text-[var(--md-sys-color-on-surface-variant)]"> {s.advice}</span>
              </p>
            ))}
          </div>
          <AiResultFooter meta={ai.meta} loading={ai.loading} onRegenerate={() => ai.generate({ params: queryToParams(query) }, true)} />
        </div>
      )}
    </ChartCard>
  )
}

/* ─── D3 What-ifシミュレータ ─── */

const WHATIF_METRICS: { key: WhatIfChange['metric']; label: string }[] = [
  { key: 'contractRate', label: '成約率' },
  { key: 'avgDealAmount', label: '平均案件単価' },
  { key: 'dealCount', label: '案件数' },
  { key: 'newCustomers', label: '新規顧客数' },
]

type WhatIfContent = { base: WhatIfBase; simulation: WhatIfResult; advice: { summary: string; suggestions: AiInsightItem[] } }

function WhatIfSection({ query }: { query: string }) {
  const [metric, setMetric] = useState<WhatIfChange['metric']>('contractRate')
  const [percent, setPercent] = useState(10)
  const [content, setContent] = useState<WhatIfContent | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/analytics/ai/whatif?${query}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes: [{ metric, changePercent: percent }] }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`)
      setContent(json.content as WhatIfContent)
    } catch (e) {
      setError(e instanceof Error ? e.message : '試算に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <ChartCard title="🧮 What-ifシミュレータ" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">現在の期間・フィルタが試算のベース</span>}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={metric} onChange={e => setMetric(e.target.value as WhatIfChange['metric'])} className="text-xs rounded-lg px-2 py-1.5 border border-[var(--md-sys-color-outline-variant)] bg-transparent text-[var(--md-sys-color-on-surface)]">
          {WHATIF_METRICS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
        </select>
        <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">を</span>
        <input
          type="range" min={-50} max={100} step={5} value={percent}
          onChange={e => setPercent(Number(e.target.value))}
          className="w-36"
        />
        <span className="text-xs font-bold tabular-nums w-14 text-[var(--md-sys-color-on-surface)]">{percent >= 0 ? '+' : ''}{percent}%</span>
        <button onClick={run} disabled={loading} className="text-xs px-3.5 py-1.5 rounded-full font-semibold bg-[var(--md-sys-color-primary,#374151)] text-[var(--md-sys-color-on-primary,#fff)] disabled:opacity-50 hover:opacity-90">
          試算する
        </button>
      </div>

      {loading && <AiLoadingSkeleton label="試算して施策を検討しています…" />}
      {error && <AiErrorNote message={error} />}

      {content && !loading && (
        <div className="space-y-3.5">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl p-3 bg-[var(--md-sys-color-surface-container-high,#f7f7f7)]">
              <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">現状の売上（買取金額）</p>
              <p className="text-lg font-bold tabular-nums text-[var(--md-sys-color-on-surface)]">{fmtYen(content.simulation.base.revenue)}</p>
              <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">成約 {content.simulation.base.wonCount}件 ・ 成約率 {fmtPct(content.base.contractRate)}</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: 'rgba(79,142,247,0.08)' }}>
              <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">試算後の売上</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: '#4f8ef7' }}>{fmtYen(content.simulation.projected.revenue)}</p>
              <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">成約 {content.simulation.projected.wonCount}件</p>
            </div>
            <div className="rounded-xl p-3" style={{ background: content.simulation.delta.revenue >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)' }}>
              <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">インパクト</p>
              <p className="text-lg font-bold tabular-nums" style={{ color: content.simulation.delta.revenue >= 0 ? '#16a34a' : '#ef4444' }}>
                {content.simulation.delta.revenue >= 0 ? '+' : ''}{fmtYen(content.simulation.delta.revenue)}
              </p>
              <p className="text-[10px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">{content.simulation.delta.revenuePercent >= 0 ? '+' : ''}{content.simulation.delta.revenuePercent.toFixed(1)}%</p>
            </div>
          </div>
          {content.advice.summary && <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{content.advice.summary}</p>}
          <AiItemList items={content.advice.suggestions} />
        </div>
      )}
    </ChartCard>
  )
}

/* ─── ③ 経営レポート ─── */

function ReportSection({ query }: { query: string }) {
  const ai = useAiPost<ReportResult>('report')
  useEffect(() => { ai.reset() }, [query]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <ChartCard title="📋 AI経営レポート" aside={<span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">現在の期間・フィルタで全タブを横断分析</span>}>
      {!ai.content && !ai.loading && !ai.error && (
        <button onClick={() => ai.generate({ params: queryToParams(query) })} className="text-xs px-3.5 py-1.5 rounded-full font-semibold bg-[var(--md-sys-color-primary,#374151)] text-[var(--md-sys-color-on-primary,#fff)] hover:opacity-90">
          ✨ レポートを生成（全タブ横断・30秒ほどかかります）
        </button>
      )}
      {ai.loading && <AiLoadingSkeleton label="7つのタブのデータを集めてレポートを執筆しています…" />}
      {ai.error && <AiErrorNote message={ai.error} />}
      {ai.content && !ai.loading && (
        <>
          <ReportView report={ai.content} />
          <AiResultFooter meta={ai.meta} loading={ai.loading} onRegenerate={() => ai.generate({ params: queryToParams(query) }, true)} />
        </>
      )}
    </ChartCard>
  )
}

/* ─── タブ本体 ─── */

export default function AiLabTab({ query }: { query: string }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
        <SparkleIcon className="w-3.5 h-3.5" />
        AIによる高度な分析。生成結果はキャッシュされ、「再生成」で最新データから作り直せます。
      </div>
      <WeeklyDigestSection />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <StoreAlertsSection />
        <WhatIfSection query={query} />
      </div>
      <TextMiningSection query={query} />
      <RfmSection query={query} />
      <ReportSection query={query} />
    </div>
  )
}
