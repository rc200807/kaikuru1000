'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmptyState from '@/components/EmptyState'
import { useToast } from '@/components/Toast'
import {
  KOBUTSU_CATEGORIES,
  KOBUTSU_CATEGORY_LABEL,
  KOBUTSU_MISSING_LABEL,
  type KobutsuCategoryKey,
  type KobutsuLedgerRow,
} from '@/lib/kobutsu-ledger'
import { formatJstDate } from '@/lib/datetime'

type Summary = { count: number; quantity: number; total: number; incomplete: number }

const fmtYen = (n: number) => `¥${(n ?? 0).toLocaleString()}`
const fmtDate = (iso: string) => formatJstDate(iso, { year: 'numeric', month: '2-digit', day: '2-digit' })

/** JST基準の "yyyy-MM-dd" */
function jstKey(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
}

/** 期間プリセット（当月・前月・直近3ヶ月・今年） */
function presetRange(kind: 'thisMonth' | 'lastMonth' | 'last3' | 'thisYear'): { from: string; to: string } {
  const now = new Date()
  const y = Number(jstKey(now).slice(0, 4))
  const m = Number(jstKey(now).slice(5, 7))
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate()

  if (kind === 'thisMonth') return { from: `${y}-${pad(m)}-01`, to: jstKey(now) }
  if (kind === 'lastMonth') {
    const ly = m === 1 ? y - 1 : y
    const lm = m === 1 ? 12 : m - 1
    return { from: `${ly}-${pad(lm)}-01`, to: `${ly}-${pad(lm)}-${pad(lastDay(ly, lm))}` }
  }
  if (kind === 'last3') {
    let sy = y, sm = m - 2
    while (sm <= 0) { sm += 12; sy -= 1 }
    return { from: `${sy}-${pad(sm)}-01`, to: jstKey(now) }
  }
  return { from: `${y}-01-01`, to: jstKey(now) }
}

export default function KobutsuLedgerPage() {
  const { status: authStatus } = useSession()
  const router = useRouter()
  const { success, error: toastError } = useToast()

  const initial = useMemo(() => presetRange('thisMonth'), [])
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [q, setQ] = useState('')
  const [onlyIncomplete, setOnlyIncomplete] = useState(false)

  const [rows, setRows] = useState<KobutsuLedgerRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [loading, setLoading] = useState(true)

  // 補記モーダル
  const [editRow, setEditRow] = useState<KobutsuLedgerRow | null>(null)
  const [editCategory, setEditCategory] = useState<KobutsuCategoryKey | ''>('')
  const [editFeatures, setEditFeatures] = useState('')
  const [editNote, setEditNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (authStatus === 'unauthenticated') router.push('/store/login')
  }, [authStatus, router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (from) params.set('from', from)
      if (to) params.set('to', to)
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/store/kobutsu-ledger?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setRows(data.rows ?? [])
        setSummary(data.summary ?? null)
        setTruncated(!!data.truncated)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [from, to, q])

  useEffect(() => {
    if (authStatus === 'authenticated') load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus, from, to])

  const visibleRows = useMemo(
    () => (onlyIncomplete ? rows.filter(r => r.missing.length > 0) : rows),
    [rows, onlyIncomplete],
  )

  function openEdit(row: KobutsuLedgerRow) {
    setEditRow(row)
    setEditCategory(row.categoryManual && row.categoryKey ? row.categoryKey : '')
    setEditFeatures(row.featuresManual ? row.features : '')
    setEditNote(row.note ?? '')
  }

  async function saveEdit() {
    if (!editRow) return
    setSaving(true)
    try {
      const res = await fetch(`/api/store/kobutsu-ledger/${editRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kobutsuCategory: editCategory || null,
          features: editFeatures.trim() || null,
          note: editNote.trim() || null,
        }),
      })
      if (res.ok) {
        success('台帳の記載を保存しました')
        setEditRow(null)
        load()
      } else {
        const data = await res.json().catch(() => ({}))
        toastError(data.error || '保存に失敗しました')
      }
    } catch {
      toastError('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  function exportCsv() {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (q.trim()) params.set('q', q.trim())
    window.location.href = `/api/store/kobutsu-ledger/export?${params.toString()}`
  }

  if (authStatus === 'loading') return <LoadingSpinner size="lg" fullPage />

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 56px)' }}>
      <AppBar
        title="古物台帳"
        subtitle="売買契約書が発行された買取（買受け）の記録"
        actions={<Button size="sm" onClick={exportCsv} disabled={loading}>CSV出力</Button>}
      />

      <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-4 flex flex-col gap-3">
        {/* 期間・検索 */}
        <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">開始日</span>
              <input
                type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="px-2 py-1.5 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">終了日</span>
              <input
                type="date" value={to} onChange={e => setTo(e.target.value)}
                className="px-2 py-1.5 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)]"
              />
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {([
                { key: 'thisMonth', label: '当月' },
                { key: 'lastMonth', label: '前月' },
                { key: 'last3', label: '直近3ヶ月' },
                { key: 'thisYear', label: '今年' },
              ] as const).map(p => (
                <button
                  key={p.key}
                  onClick={() => { const r = presetRange(p.key); setFrom(r.from); setTo(r.to) }}
                  className="px-3 py-1 rounded-full text-xs font-medium bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-highest)]"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') load() }}
              placeholder="検索（品名・特徴・相手方の氏名）"
              className="flex-1 min-w-[200px] px-3 py-2 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-highest)] text-sm text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--store-primary)]"
            />
            <Button size="sm" variant="tonal" onClick={load} loading={loading}>絞り込む</Button>
            <label className="flex items-center gap-1.5 text-xs text-[var(--md-sys-color-on-surface-variant)] cursor-pointer">
              <input type="checkbox" checked={onlyIncomplete} onChange={e => setOnlyIncomplete(e.target.checked)} className="w-4 h-4" />
              記載不備のみ
            </label>
          </div>
        </div>

        {/* サマリー */}
        {summary && (
          <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-3 flex items-center gap-6 flex-wrap">
            <div>
              <div className="text-2xl font-bold text-[var(--md-sys-color-on-surface)] leading-none">
                {summary.count}<span className="text-base font-semibold">件</span>
              </div>
              <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">記載件数（品目単位）</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[var(--md-sys-color-on-surface)] leading-none">{summary.quantity}<span className="text-base font-semibold">点</span></div>
              <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">数量合計</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-[var(--md-sys-color-on-surface)] leading-none">{fmtYen(summary.total)}</div>
              <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">代価合計</div>
            </div>
            {summary.incomplete > 0 && (
              <div>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 leading-none">
                  {summary.incomplete}<span className="text-base font-semibold">件</span>
                </div>
                <div className="text-[11px] text-amber-700 dark:text-amber-400 mt-1">記載事項に不足あり</div>
              </div>
            )}
          </div>
        )}

        {truncated && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            件数が多いため一部のみ表示しています。期間を狭めるか、CSV出力をご利用ください。
          </p>
        )}

        {/* 一覧 */}
        {loading ? (
          <div className="py-16"><LoadingSpinner size="lg" /></div>
        ) : visibleRows.length === 0 ? (
          <EmptyState
            icon={
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            }
            title="該当する記録がありません"
            description="売買契約書が発行された買取が、指定期間内にありません"
          />
        ) : (
          <>
            {/* PC: 帳簿の様式に沿った表 */}
            <div className="hidden md:block overflow-x-auto rounded-xl border border-[var(--md-sys-color-outline-variant)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--md-sys-color-surface-container)]">
                  <tr>
                    {['取引年月日', '区別', '品目', '品名 / 特徴', '数量', '代価', '相手方（住所・氏名・職業・年齢）', '確認方法', '備考', ''].map(h => (
                      <th key={h} className="px-2.5 py-2 text-left font-semibold text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(r => (
                    <tr key={r.id} className="border-t border-[var(--md-sys-color-outline-variant)] align-top">
                      <td className="px-2.5 py-2 whitespace-nowrap text-[var(--md-sys-color-on-surface)]">{fmtDate(r.tradedAt)}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap text-[var(--md-sys-color-on-surface-variant)]">{r.tradeType}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        {r.categoryKey ? (
                          <span className="text-[var(--md-sys-color-on-surface)]">
                            {KOBUTSU_CATEGORY_LABEL[r.categoryKey]}
                            {!r.categoryManual && <span className="ml-1 text-[10px] text-[var(--md-sys-color-on-surface-faint)]">推定</span>}
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400">未設定</span>
                        )}
                      </td>
                      <td className="px-2.5 py-2 min-w-[220px]">
                        <div className="font-medium text-[var(--md-sys-color-on-surface)]">{r.itemName}</div>
                        <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] break-words">{r.features || '—'}</div>
                      </td>
                      <td className="px-2.5 py-2 whitespace-nowrap text-[var(--md-sys-color-on-surface)]">{r.quantity}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap text-[var(--md-sys-color-on-surface)]">{fmtYen(r.price)}</td>
                      <td className="px-2.5 py-2 min-w-[220px]">
                        <div className="text-[var(--md-sys-color-on-surface)]">{r.customer.name}</div>
                        <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] break-words">
                          {r.customer.address || <span className="text-amber-600 dark:text-amber-400">住所なし</span>}
                        </div>
                        <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                          {r.customer.occupation || <span className="text-amber-600 dark:text-amber-400">職業なし</span>}
                          {' ・ '}
                          {r.customer.age != null ? `${r.customer.age}歳` : <span className="text-amber-600 dark:text-amber-400">年齢なし</span>}
                        </div>
                      </td>
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        {r.customer.verification || <span className="text-amber-600 dark:text-amber-400">未確認</span>}
                      </td>
                      <td className="px-2.5 py-2 max-w-[160px] text-[var(--md-sys-color-on-surface-variant)] break-words">{r.note || '—'}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button onClick={() => openEdit(r)} className="text-[var(--store-primary)] hover:underline">記載</button>
                          {r.dealId && (
                            <Link href={`/store/deals/${r.dealId}`} className="text-[var(--md-sys-color-on-surface-variant)] hover:underline">案件</Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* モバイル: カード */}
            <div className="md:hidden flex flex-col gap-2">
              {visibleRows.map(r => (
                <div key={r.id} className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{fmtDate(r.tradedAt)} ・ {r.tradeType}</span>
                    <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">{fmtYen(r.price)}</span>
                  </div>
                  <div className="mt-1 text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                    {r.itemName} <span className="text-xs font-normal text-[var(--md-sys-color-on-surface-variant)]">×{r.quantity}</span>
                  </div>
                  <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                    品目: {r.categoryKey ? KOBUTSU_CATEGORY_LABEL[r.categoryKey] : '未設定'} / {r.features || '特徴なし'}
                  </div>
                  <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
                    {r.customer.name}（{r.customer.occupation || '職業なし'} / {r.customer.age != null ? `${r.customer.age}歳` : '年齢なし'}）
                  </div>
                  <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{r.customer.address || '住所なし'}</div>
                  <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">確認方法: {r.customer.verification || '未確認'}</div>
                  {r.missing.length > 0 && (
                    <div className="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                      未記載: {r.missing.map(m => KOBUTSU_MISSING_LABEL[m]).join('・')}
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    <button onClick={() => openEdit(r)} className="text-xs text-[var(--store-primary)] font-medium">記載を編集</button>
                    {r.dealId && <Link href={`/store/deals/${r.dealId}`} className="text-xs text-[var(--md-sys-color-on-surface-variant)]">案件を開く</Link>}
                  </div>
                </div>
              ))}
            </div>

            {/* 不備の内訳（PC表では列内に出しているので補足のみ） */}
            <p className="hidden md:block text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              「品目」の「推定」は品名・カテゴリからの自動判定です。法定13品目の確定は「記載」から指定してください。
            </p>
          </>
        )}

        <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-3 text-[11px] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
          <p className="font-semibold text-[var(--md-sys-color-on-surface)] mb-1">この台帳について</p>
          <p>
            古物営業法16条・同施行規則17条（別記様式第15号）の記載事項（取引年月日／品目／数量／特徴／相手方の住所・氏名・職業・年齢／確認方法）に沿って、
            売買契約書が発行された買取を1品目=1行で表示しています。帳簿は最終記載日から3年間の保存が必要です。
            電子帳簿として運用する場合は、営業所で直ちに書面へ表示できる状態（印刷できる環境）を整えてください。
          </p>
          <p className="mt-1">表示・出力の対象はログイン中の営業所（店舗）の取引のみです。</p>
        </div>
      </div>

      {/* 記載（補記）モーダル */}
      <Modal
        open={!!editRow}
        onClose={() => setEditRow(null)}
        title="台帳の記載を編集"
        size="md"
        footer={
          <>
            <Button variant="text" onClick={() => setEditRow(null)}>キャンセル</Button>
            <Button onClick={saveEdit} loading={saving}>保存</Button>
          </>
        }
      >
        {editRow && (
          <div className="space-y-4">
            <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              {fmtDate(editRow.tradedAt)} ・ {editRow.itemName} ・ {fmtYen(editRow.price)}
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">品目（法定13品目）</label>
              <select
                value={editCategory}
                onChange={e => setEditCategory(e.target.value as KobutsuCategoryKey | '')}
                className="w-full px-2 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]"
              >
                <option value="">
                  自動推定に任せる{editRow.categoryKey && !editRow.categoryManual ? `（現在: ${KOBUTSU_CATEGORY_LABEL[editRow.categoryKey]}）` : ''}
                </option>
                {KOBUTSU_CATEGORIES.map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">古物の特徴</label>
              <textarea
                value={editFeatures}
                onChange={e => setEditFeatures(e.target.value)}
                rows={3}
                placeholder={`未入力なら自動生成: ${editRow.features || '（生成できる情報がありません）'}`}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] resize-y"
              />
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
                メーカー名・ブランド名・型番・シリアル番号・色・材質・傷など、品物を特定できる情報を記載します。
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">備考</label>
              <textarea
                value={editNote}
                onChange={e => setEditNote(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] resize-y"
              />
            </div>

            {editRow.missing.length > 0 && (
              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700 p-2.5 text-[11px] text-amber-800 dark:text-amber-200">
                <p className="font-semibold mb-0.5">未記載の項目: {editRow.missing.map(m => KOBUTSU_MISSING_LABEL[m]).join('・')}</p>
                <p>
                  住所・職業・年齢・確認方法は顧客情報から取り込みます。
                  {editRow.dealId && <> <Link href={`/store/deals/${editRow.dealId}`} className="underline">案件詳細</Link>から顧客情報を補ってください。</>}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
