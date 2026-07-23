'use client'

// sysadmin ポータル共通のUI部品。
// dashboard / finance / users 等の各画面で重複定義されていた Kpi / Panel / Empty を集約。

import Link from 'next/link'
import { useState } from 'react'

export const yen = (n: number) => `¥${n.toLocaleString()}`

export const PIE_COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6', '#22d3ee']

export const tooltipStyle: React.CSSProperties = {
  background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#ededed', fontSize: 12,
}

export function Kpi({ label, value, accent, href }: { label: string; value: string; accent?: boolean; href?: string }) {
  const [hover, setHover] = useState(false)
  const card = (
    <div
      onMouseEnter={href ? () => setHover(true) : undefined}
      onMouseLeave={href ? () => setHover(false) : undefined}
      style={{
        background: 'var(--md-sys-color-surface-container-low)',
        borderRadius: 12,
        padding: 16,
        border: `1px solid ${hover ? 'rgba(255,255,255,0.25)' : 'var(--md-sys-color-outline-variant)'}`,
        transition: 'border-color 150ms',
        height: '100%',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent ? '#fbbf24' : 'var(--md-sys-color-on-surface)' }}>{value}</div>
    </div>
  )
  if (!href) return card
  return <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>{card}</Link>
}

export function Panel({ title, children, style }: { title: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, padding: 20, border: '1px solid var(--md-sys-color-outline-variant)', ...style }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700 }}>{title}</h2>
      {children}
    </div>
  )
}

export function Empty({ text = 'データがありません' }: { text?: string }) {
  return <p style={{ color: 'var(--md-sys-color-on-surface-variant)', textAlign: 'center', padding: 40, fontSize: 13 }}>{text}</p>
}

export function pagerBtn(disabled: boolean): React.CSSProperties {
  return {
    padding: '6px 14px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)',
    background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13,
    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
  }
}

/** ページャー（前へ / n / m / 次へ） */
export function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
      <button onClick={() => onChange(Math.max(1, page - 1))} disabled={page <= 1} style={pagerBtn(page <= 1)}>前へ</button>
      <span style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>{page} / {totalPages}</span>
      <button onClick={() => onChange(Math.min(totalPages, page + 1))} disabled={page >= totalPages} style={pagerBtn(page >= totalPages)}>次へ</button>
    </div>
  )
}

/** ステータスバッジ */
export function StatusChip({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return <span style={{ display: 'inline-block', padding: '2px 10px', borderRadius: 999, background: bg, color: fg, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>
}

/** フィルターチップ（丸ボタン） */
export function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px', borderRadius: 999, fontSize: 13, cursor: 'pointer',
        border: '1px solid var(--md-sys-color-outline-variant)',
        background: active ? 'var(--md-sys-color-primary)' : 'transparent',
        color: active ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface)',
        fontWeight: active ? 700 : 500,
      }}
    >
      {children}
    </button>
  )
}

/** テーブルの外枠 */
export function TableCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, border: '1px solid var(--md-sys-color-outline-variant)', overflow: 'auto' }}>
      {children}
    </div>
  )
}

export const tableStyle: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 }
export const theadRowStyle: React.CSSProperties = { textAlign: 'left', background: 'var(--md-sys-color-surface-container)', fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }
export const thStyle: React.CSSProperties = { padding: '10px 16px', whiteSpace: 'nowrap' }
export const tdStyle: React.CSSProperties = { padding: '10px 16px' }
export const trStyle: React.CSSProperties = { borderTop: '1px solid var(--md-sys-color-outline-variant)' }
