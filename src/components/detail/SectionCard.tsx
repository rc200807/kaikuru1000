'use client'

/**
 * 詳細画面のセクションカード（案件詳細・顧客詳細で共用）。
 * 共通の Card は影を inline style で焼いていて管理ポータル（暗面）では枠が見えないため、
 * 境界を border で描く（ChartCard/KpiCard と同じ流儀）。
 * collapsible のときは state を持たない <details> で折りたたむ。
 * 注意: 管理ポータルは globals.css が header に背景を !important で強制するため header は使わない。
 */
import { useRef } from 'react'

export const SECTION_CLS =
  'rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)]'

export default function Section({
  title,
  meta,
  badge,
  actions,
  children,
  collapsible = false,
  defaultOpen = true,
  bodyClassName = 'px-4 sm:px-5 pb-4 sm:pb-5',
  id,
  className = '',
  step,
  tone = 'default',
}: {
  title: string
  meta?: React.ReactNode
  badge?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  bodyClassName?: string
  id?: string
  className?: string
  /** 訪問時に順番に操作するセクションの手順番号（Step1〜）。指定すると見出しに STEP バッジが出る */
  step?: number
  /** work = 訪問時に手を動かすセクション（左に色帯＋見出しに淡い下地）。record = 実施後の記録 */
  tone?: 'default' | 'work' | 'record'
}) {
  // 色は --step-* トークン（ポータルごとに globals.css で定義）。
  // 店舗=赤／管理=白の主色と衝突させず、作業セクションだけを別系統の色で見分けられるようにする
  // overflow-hidden は色帯・見出しの下地が角丸からはみ出さないようにするためのもの。
  // tone 無しの既存セクション（顧客詳細など）に付けると内部のポップオーバーを切りかねないので付けない
  const toneCls =
    tone === 'work' ? 'border-l-[3px] border-l-[var(--step-accent)] overflow-hidden'
    : tone === 'record' ? 'border-l-[3px] border-l-[var(--md-sys-color-outline)] overflow-hidden'
    : ''
  const headerCls =
    tone === 'work' ? 'bg-[var(--step-surface)]'
    : ''
  const header = (
    // 狭い幅では actions を次行に折り返す（min-w-0 のままだと見出しが1文字ずつ縦に潰れる）
    <div className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 px-4 sm:px-5 pt-4 sm:pt-5 pb-3 ${headerCls}`}>
      <div className="flex items-center gap-2 min-w-0 flex-wrap">
        {step != null && (
          <span
            className="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap"
            style={{ background: 'var(--step-accent)', color: 'var(--step-on-badge)' }}
          >
            STEP {step}
          </span>
        )}
        <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] whitespace-nowrap">{title}</h2>
        {meta && <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{meta}</span>}
        {badge}
        {collapsible && (
          <svg className="w-3.5 h-3.5 text-[var(--md-sys-color-on-surface-variant)] transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>
      {actions && (
        <div
          className="flex items-center gap-2 flex-shrink-0"
          // summary 内のクリックは details をトグルしてしまうので伝播を止める。
          // ただしリンク・ボタン・ファイル選択などは既定動作を殺さない（label の
          // activation behavior まで preventDefault すると input[type=file] が開かなくなる）
          onClick={collapsible ? (e => {
            const el = e.target as HTMLElement
            if (el.closest('a,button,label,input,select,textarea')) { e.stopPropagation(); return }
            e.preventDefault(); e.stopPropagation()
          }) : undefined}
        >
          {actions}
        </div>
      )}
    </div>
  )
  if (!collapsible) {
    return <div id={id} className={`${SECTION_CLS} ${toneCls} ${className}`}>{header}<div className={bodyClassName}>{children}</div></div>
  }
  return (
    <details id={id} open={defaultOpen} className={`${SECTION_CLS} ${toneCls} ${className} group`}>
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer">{header}</summary>
      <div className={bodyClassName}>{children}</div>
    </details>
  )
}

/** 折りたたみの既定開閉。データ到着後に一度だけ確定させ、以降はユーザー操作（DOM）に任せる */
export function useOpenLatch() {
  const latch = useRef<Record<string, boolean>>({})
  return (key: string, value: boolean, ready = true) => {
    if (ready && !(key in latch.current)) latch.current[key] = value
    return latch.current[key] ?? value
  }
}
