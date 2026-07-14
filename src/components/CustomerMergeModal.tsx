'use client'

import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/Modal'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'

export type MergeCustomer = {
  id: string
  name: string
  furigana?: string | null
  email?: string | null
  phone?: string | null
  address?: string | null
  birthDate?: string | null
}

const FIELDS: { key: keyof MergeCustomer; label: string }[] = [
  { key: 'name', label: '氏名' },
  { key: 'furigana', label: 'フリガナ' },
  { key: 'email', label: 'メール' },
  { key: 'phone', label: '電話' },
  { key: 'address', label: '住所' },
  { key: 'birthDate', label: '生年月日' },
]

/**
 * 顧客統合モーダル（管理・店舗共通）。
 * base（開いた顧客）＋ 検索で選んだ相手顧客の2件を統合する。
 * どちらを残すか（survivor）を選び、各項目でどちらの値を採用するか選択。
 * 案件・訪問記録などの関連データは全て survivor に付け替えられる。
 */
export default function CustomerMergeModal({
  open,
  onClose,
  base,
  onSearch,
  onMerged,
}: {
  open: boolean
  onClose: () => void
  base: MergeCustomer
  onSearch: (query: string) => Promise<MergeCustomer[]>
  onMerged: (survivorId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MergeCustomer[]>([])
  const [searching, setSearching] = useState(false)
  const [other, setOther] = useState<MergeCustomer | null>(null)
  const [survivorId, setSurvivorId] = useState<string>(base.id)
  const [choice, setChoice] = useState<Record<string, string>>({}) // field -> customerId(採用元)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setQuery(''); setResults([]); setOther(null); setSurvivorId(base.id); setChoice({}); setError(''); setSearching(false)
    }
  }, [open, base.id])

  // 相手を選んだら、各項目の既定採用元＝survivor
  useEffect(() => {
    if (!other) return
    const init: Record<string, string> = {}
    for (const f of FIELDS) init[f.key as string] = survivorId
    setChoice(init)
  }, [other, survivorId])

  const survivor = survivorId === base.id ? base : other
  const merged = survivorId === base.id ? other : base

  async function doSearch() {
    setSearching(true); setError('')
    try {
      const list = (await onSearch(query.trim())).filter(c => c.id !== base.id)
      setResults(list)
    } catch { setError('検索に失敗しました') }
    setSearching(false)
  }

  const val = (c: MergeCustomer | null, key: keyof MergeCustomer) => (c ? (c[key] ?? '') : '') as string

  async function handleMerge() {
    if (!other || !survivor || !merged) return
    setSubmitting(true); setError('')
    // 各項目の採用値（採用元の顧客の値）
    const scalars: Record<string, unknown> = {}
    for (const f of FIELDS) {
      const src = choice[f.key as string] === base.id ? base : other
      scalars[f.key as string] = (src[f.key] ?? null)
    }
    try {
      const res = await fetch('/api/customers/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ survivorId: survivor.id, mergedId: merged.id, scalars }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || '統合に失敗しました') }
      onMerged(survivor.id)
      onClose()
    } catch (e: any) {
      setError(e?.message || '統合に失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  const custLabel = (c: MergeCustomer | null) => c ? `${c.name}${c.email ? `（${c.email}）` : ''}` : '—'

  return (
    <Modal open={open} onClose={onClose} title="顧客を統合" size="lg">
      <div className="space-y-4">
        <div className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--md-sys-color-surface-container-high)' }}>
          <span className="font-semibold text-[var(--md-sys-color-on-surface)]">{custLabel(base)}</span> を別の顧客と統合します。
          <br />案件・訪問記録などは両方のデータを残して統合先にまとめられ、吸収された顧客は無効化されます（元に戻せません）。
        </div>

        {error && <MessageBanner severity="error">{error}</MessageBanner>}

        {/* 相手顧客の検索・選択 */}
        {!other ? (
          <div>
            <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">統合する相手の顧客を検索</label>
            <div className="flex gap-2">
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') doSearch() }}
                placeholder="氏名・メール・電話などで検索"
                className="flex-1 px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]"
              />
              <Button size="sm" onClick={doSearch} loading={searching} disabled={searching}>検索</Button>
            </div>
            <div className="mt-2 max-h-60 overflow-y-auto divide-y divide-[var(--md-sys-color-outline-variant)] rounded-lg border border-[var(--md-sys-color-outline-variant)]">
              {results.length === 0 ? (
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] p-3">{searching ? '検索中...' : '検索結果がここに表示されます'}</p>
              ) : results.map(c => (
                <button key={c.id} type="button" onClick={() => setOther(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--md-sys-color-surface-container-low)]">
                  <span className="font-medium text-[var(--md-sys-color-on-surface)]">{c.name}</span>
                  <span className="text-xs text-[var(--md-sys-color-on-surface-variant)] ml-2">{c.email || c.phone || ''}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* 残す顧客の選択 */}
            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">残す顧客（こちらに統合されます）</label>
              <div className="grid grid-cols-2 gap-2">
                {[base, other].map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSurvivorId(c.id)}
                    className={`text-left px-3 py-2 rounded-lg border text-sm ${survivorId === c.id ? 'border-[var(--portal-primary)] ring-2 ring-[var(--portal-primary)]/30 bg-[var(--md-sys-color-surface-container-low)]' : 'border-[var(--md-sys-color-outline-variant)]'}`}
                  >
                    <div className="font-medium text-[var(--md-sys-color-on-surface)] truncate">{c.name}</div>
                    <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate">{c.email || c.phone || '—'}</div>
                    <div className="text-[10px] mt-0.5" style={{ color: survivorId === c.id ? 'var(--portal-primary)' : 'var(--md-sys-color-on-surface-variant)' }}>{survivorId === c.id ? '残す' : '吸収して無効化'}</div>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setOther(null)} className="text-[11px] text-[var(--portal-primary)] hover:underline mt-1">相手を選び直す</button>
            </div>

            {/* 項目ごとの採用値 */}
            <div className="overflow-x-auto rounded-lg border border-[var(--md-sys-color-outline-variant)]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[var(--md-sys-color-surface-container-low)] border-b border-[var(--md-sys-color-outline-variant)]">
                    <th className="text-left px-2 py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">項目</th>
                    <th className="text-left px-2 py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">{base.name}</th>
                    <th className="text-left px-2 py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">{other.name}</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELDS.map(f => (
                    <tr key={f.key as string} className="border-b border-[var(--md-sys-color-outline-variant)]/50 last:border-0">
                      <td className="px-2 py-1.5 text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">{f.label}</td>
                      {[base, other].map(c => (
                        <td key={c.id} className="px-2 py-1.5">
                          <label className="flex items-start gap-1.5 cursor-pointer">
                            <input
                              type="radio"
                              name={`field-${f.key as string}`}
                              checked={choice[f.key as string] === c.id}
                              onChange={() => setChoice(prev => ({ ...prev, [f.key as string]: c.id }))}
                              className="mt-0.5 accent-[var(--portal-primary)]"
                            />
                            <span className="text-[var(--md-sys-color-on-surface)] break-words">{val(c, f.key) || <span className="text-[var(--md-sys-color-on-surface-variant)]">—</span>}</span>
                          </label>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="text" onClick={onClose} disabled={submitting}>キャンセル</Button>
              <Button onClick={handleMerge} loading={submitting} disabled={submitting}>統合を実行</Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
