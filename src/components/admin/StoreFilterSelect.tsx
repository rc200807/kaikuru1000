'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

// 店舗を検索して選択できるコンボボックス（管理ポータルのフィルタ用）。
// 店舗数が多いため、プルダウン内の検索ボックスで絞り込める。

type StoreOpt = { id: string; name: string; code?: string }

export default function StoreFilterSelect({
  value,
  onChange,
  stores,
  allLabel = 'すべての店舗',
  style,
}: {
  value: string
  onChange: (id: string) => void
  stores: StoreOpt[]
  allLabel?: string
  style?: React.CSSProperties
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQ('') }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // 開いたとき、モーダル等のスクロール領域内でコントロールを上部へ寄せ、
  // 下に開く候補リストが見切れないようにする。
  useEffect(() => {
    if (!open) return
    const el = ref.current
    if (!el) return
    const t = setTimeout(() => {
      // 直近のスクロール可能な祖先を探す
      let p: HTMLElement | null = el.parentElement
      while (p) {
        const s = getComputedStyle(p)
        if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight + 4) break
        p = p.parentElement
      }
      if (!p) { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return }
      const pr = p.getBoundingClientRect()
      const er = el.getBoundingClientRect()
      // コントロールをスクロール領域上端の少し下へ移動（下に候補表示スペースを確保）
      const delta = (er.top - pr.top) - 12
      if (delta > 0) p.scrollBy({ top: delta, behavior: 'smooth' })
    }, 0)
    return () => clearTimeout(t)
  }, [open])

  const selected = stores.find(s => s.id === value)
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    if (!kw) return stores
    return stores.filter(s => s.name.toLowerCase().includes(kw) || (s.code ?? '').toLowerCase().includes(kw))
  }, [q, stores])

  const pick = (id: string) => { onChange(id); setOpen(false); setQ('') }

  const controlStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 8,
    border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)',
    color: 'var(--md-sys-color-on-surface)', fontSize: 12, textAlign: 'left', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
  }

  const optionStyle = (active: boolean): React.CSSProperties => ({
    width: '100%', boxSizing: 'border-box', textAlign: 'left', padding: '8px 10px', fontSize: 12,
    border: 'none', cursor: 'pointer', color: 'var(--md-sys-color-on-surface)',
    background: active ? 'var(--md-sys-color-surface-container-high)' : 'transparent',
    fontWeight: active ? 700 : 400,
  })

  return (
    <div ref={ref} style={{ position: 'relative', ...style }}>
      <button type="button" onClick={() => setOpen(o => !o)} style={controlStyle}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: selected ? 'var(--md-sys-color-on-surface)' : 'var(--md-sys-color-on-surface-variant)' }}>
          {selected ? selected.name : allLabel}
        </span>
        <span style={{ opacity: 0.6, flexShrink: 0 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', zIndex: 50, top: 'calc(100% + 4px)', left: 0, minWidth: '100%', width: 'max-content', maxWidth: 320,
          maxHeight: 300, overflowY: 'auto', background: 'var(--md-sys-color-surface-container-highest)',
          border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}>
          <div style={{ position: 'sticky', top: 0, padding: 6, background: 'var(--md-sys-color-surface-container-highest)', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="店舗を検索..."
              style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container)', color: 'var(--md-sys-color-on-surface)', fontSize: 12 }}
            />
          </div>
          <button type="button" onClick={() => pick('')} style={optionStyle(value === '')}>{allLabel}</button>
          {filtered.map(s => (
            <button key={s.id} type="button" onClick={() => pick(s.id)} style={optionStyle(value === s.id)}>
              {s.code ? <span style={{ opacity: 0.6, marginRight: 6 }}>[{s.code}]</span> : null}{s.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: '10px', fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>該当する店舗がありません</div>
          )}
        </div>
      )}
    </div>
  )
}
