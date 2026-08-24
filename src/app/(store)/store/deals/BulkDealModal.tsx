'use client'

// 案件の一括変更モーダル（店舗ポータル）。値の選択だけを担当し、送信は呼び出し側。
import { useEffect, useState } from 'react'
import Modal from '@/components/Modal'
import Button from '@/components/Button'
import { DEAL_STATUS_ORDER, DEAL_STATUS_LABEL } from '@/lib/deal-status'
import { dealCategoryOptionsFor } from '@/components/list/store-deal-filter-defs'

export type BulkMode = 'status' | 'category' | 'member' | null

const SELECT_CLS = 'w-full h-10 px-3 rounded-lg border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] text-[var(--md-sys-color-on-surface)] text-sm'

export default function BulkDealModal({
  mode,
  onClose,
  onSubmit,
  busy,
  targetLabel,
  members,
  services,
  scopeNote,
}: {
  mode: BulkMode
  onClose: () => void
  onSubmit: (value: string) => void
  busy: boolean
  /** 「選択した3件」「絞り込み結果の全件」など */
  targetLabel: string
  members: { id: string; name: string }[]
  /** 店舗の対応サービス（アキクルの選択可否） */
  services: string[]
  /** 複数店舗スコープのときの注意書き */
  scopeNote: string | null
}) {
  const [value, setValue] = useState('')
  const categoryOptions = dealCategoryOptionsFor(services)

  // 開くたびに既定値を入れ直す
  useEffect(() => {
    if (!mode) return
    setValue(mode === 'status' ? 'inquiry' : mode === 'category' ? (categoryOptions[0]?.value ?? 'purchase') : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  return (
    <Modal
      open={mode !== null}
      onClose={onClose}
      title={mode === 'status' ? 'ステータスを一括変更' : mode === 'category' ? 'カテゴリーを一括変更' : '担当を一括変更'}
      footer={
        <>
          <Button variant="text" onClick={onClose}>キャンセル</Button>
          <Button onClick={() => onSubmit(value)} loading={busy} disabled={busy}>適用</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">{targetLabel}に適用します。</p>
        {scopeNote && (
          <p className="text-[11px] rounded-lg px-3 py-2" style={{ background: 'var(--status-pending-bg)', color: 'var(--status-pending-text)' }}>
            {scopeNote}
          </p>
        )}

        {mode === 'status' && (
          <select value={value} onChange={e => setValue(e.target.value)} className={SELECT_CLS}>
            {DEAL_STATUS_ORDER.map(s => <option key={s} value={s}>{DEAL_STATUS_LABEL[s]}</option>)}
          </select>
        )}
        {mode === 'category' && (
          <select value={value} onChange={e => setValue(e.target.value)} className={SELECT_CLS}>
            {categoryOptions.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        )}
        {mode === 'member' && (
          <select value={value} onChange={e => setValue(e.target.value)} className={SELECT_CLS}>
            <option value="">（担当を解除）</option>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
      </div>
    </Modal>
  )
}
