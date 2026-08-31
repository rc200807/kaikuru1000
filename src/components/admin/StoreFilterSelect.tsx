'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

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

  // 候補リストの表示位置。position:absolute のままだとモーダル本体（overflow-y:auto）に
  // 切られて数件しか見えないため、fixed + 実座標で置いて画面いっぱいまで使えるようにする。
  // fixed はスクロール祖先の overflow に切られない（transform 等を持つ祖先が無い限り）。
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; maxH: number } | null>(null)

  const place = useCallback(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const GAP = 4
    const MARGIN = 12 // 画面端との余白
    const MAX_H = 440
    // 非表示のタブなどでは innerHeight が 0 になることがある。その場合は判定材料が無いので
    // 従来どおり下向きに開く（上向きにすると画面外へ飛ぶ）
    const vh = window.innerHeight || document.documentElement.clientHeight
    if (!vh) {
      setPos({ left: r.left, width: r.width, top: r.bottom + GAP, maxH: MAX_H })
      return
    }
    const below = vh - r.bottom - MARGIN
    const above = r.top - MARGIN
    // 下に十分な高さが無く、上のほうが広いなら上向きに開く
    const openUp = below < 220 && above > below
    const space = (openUp ? above : below) - GAP
    setPos({
      left: r.left,
      width: r.width,
      top: openUp ? undefined : r.bottom + GAP,
      bottom: openUp ? vh - r.top + GAP : undefined,
      // 極端に狭いときでも最低限は開く（120px 未満しか無いのは画面自体が小さい場合）
      maxH: Math.min(MAX_H, Math.max(120, space)),
    })
  }, [])

  useEffect(() => {
    if (!open) { setPos(null); return }
    place()
    // モーダル本体や画面のスクロール・リサイズに追従させる（capture でネストした要素も拾う）
    const onScroll = () => place()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, place])

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

      {open && pos && (
        <div style={{
          position: 'fixed', zIndex: 1000,
          left: pos.left, top: pos.top, bottom: pos.bottom,
          minWidth: pos.width, width: 'max-content', maxWidth: Math.max(pos.width, 360),
          maxHeight: pos.maxH, overflowY: 'auto', background: 'var(--md-sys-color-surface-container-highest)',
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
