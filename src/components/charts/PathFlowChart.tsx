'use client'

// GA経路探索風の列型フロー図（SVG自作）。
// 始点（session_start）→ ステップ+1..+N の列にノードを積み、ベジェ曲線のリンクで遷移量を表現する。
// ノードクリックで関連リンクをハイライト。
import { useMemo, useState } from 'react'
import type { PathFlowResult } from '@/lib/tracking-types'

type Props = {
  data: PathFlowResult
  height?: number
}

const COL_WIDTH = 230       // 1ステップの横幅
const BAR_WIDTH = 10        // ノードバーの幅
const NODE_GAP = 14         // ノード間の縦ギャップ
const LABEL_WIDTH = COL_WIDTH - BAR_WIDTH - 24
const TOP_PAD = 46

type NodePos = { x: number; y: number; h: number; label: string; count: number; key: string; step: number }

export default function PathFlowChart({ data, height = 560 }: Props) {
  const [selected, setSelected] = useState<{ step: number; key: string } | null>(null)

  const layout = useMemo(() => {
    const cols = data.steps.length
    const usableH = height - TOP_PAD - 16
    const positions = new Map<string, NodePos>() // `${step}|${key}`

    // 始点ノード（step=-1）
    const startNode: NodePos = {
      x: 0, y: TOP_PAD, h: Math.min(usableH, 420), label: 'session_start', count: data.totalSessions, key: '__start__', step: -1,
    }

    for (let c = 0; c < cols; c++) {
      const nodes = data.steps[c].nodes
      const total = nodes.reduce((s, n) => s + n.count, 0)
      const gapTotal = NODE_GAP * Math.max(0, nodes.length - 1)
      const scale = total > 0 ? Math.max(0, usableH - gapTotal) / Math.max(total, 1) : 0
      let y = TOP_PAD
      for (const n of nodes) {
        const h = Math.max(10, n.count * scale)
        positions.set(`${c}|${n.key}`, {
          x: COL_WIDTH * (c + 1), y, h, label: n.label, count: n.count, key: n.key, step: c,
        })
        y += h + NODE_GAP
      }
    }
    return { startNode, positions, width: COL_WIDTH * (cols + 1) + 40 }
  }, [data, height])

  if (data.steps.length === 0) {
    return <p className="text-sm text-center py-12 text-[var(--md-sys-color-on-surface-variant)]">該当する経路データがありません</p>
  }

  // リンク（始点→step0 は steps[0] の全ノードへ）
  const links: { from: NodePos; to: NodePos; count: number }[] = []
  for (const n of data.steps[0]?.nodes ?? []) {
    const to = layout.positions.get(`0|${n.key}`)
    if (to) links.push({ from: layout.startNode, to, count: n.count })
  }
  for (const l of data.links) {
    const from = layout.positions.get(`${l.fromStep}|${l.fromKey}`)
    const to = layout.positions.get(`${l.fromStep + 1}|${l.toKey}`)
    if (from && to) links.push({ from, to, count: l.count })
  }
  const maxLink = Math.max(...links.map(l => l.count), 1)

  const isRelated = (node: NodePos) => {
    if (!selected) return true
    if (node.step === selected.step && node.key === selected.key) return true
    return links.some(l =>
      (l.from.step === selected.step && l.from.key === selected.key && l.to.step === node.step && l.to.key === node.key) ||
      (l.to.step === selected.step && l.to.key === selected.key && l.from.step === node.step && l.from.key === node.key)
    )
  }
  const isLinkActive = (l: { from: NodePos; to: NodePos }) => {
    if (!selected) return true
    return (l.from.step === selected.step && l.from.key === selected.key) || (l.to.step === selected.step && l.to.key === selected.key)
  }

  const allNodes: NodePos[] = [layout.startNode, ...layout.positions.values()]

  return (
    <div className="overflow-x-auto">
      <svg width={layout.width} height={height} className="select-none">
        {/* 列見出し */}
        <text x={0} y={18} fontSize={11} fontWeight={700} fill="var(--md-sys-color-on-surface-variant)">始点</text>
        {data.steps.map((s, i) => (
          <text key={i} x={COL_WIDTH * (i + 1)} y={18} fontSize={11} fontWeight={700} fill="var(--md-sys-color-on-surface-variant)">
            ステップ +{i + 1}
          </text>
        ))}

        {/* リンク */}
        {links.map((l, i) => {
          const x1 = l.from.x + BAR_WIDTH
          const y1 = l.from.y + l.from.h / 2
          const x2 = l.to.x
          const y2 = l.to.y + l.to.h / 2
          const mx = (x1 + x2) / 2
          const w = Math.max(1.5, (l.count / maxLink) * 26)
          const active = isLinkActive(l)
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
              stroke="var(--md-sys-color-primary, #4f8ef7)"
              strokeWidth={w}
              strokeOpacity={active ? 0.3 : 0.06}
              fill="none"
            />
          )
        })}

        {/* ノード */}
        {allNodes.map((n, i) => {
          const related = isRelated(n)
          return (
            <g
              key={i}
              opacity={related ? 1 : 0.25}
              className="cursor-pointer"
              onClick={() => {
                if (n.step === -1) { setSelected(null); return }
                setSelected(prev => prev && prev.step === n.step && prev.key === n.key ? null : { step: n.step, key: n.key })
              }}
            >
              <rect x={n.x} y={n.y} width={BAR_WIDTH} height={n.h} rx={2}
                fill={n.key === '__other__' ? 'var(--md-sys-color-outline)' : 'var(--md-sys-color-primary, #4f8ef7)'} />
              <foreignObject x={n.x + BAR_WIDTH + 6} y={n.y - 2} width={LABEL_WIDTH} height={Math.max(n.h + 4, 34)}>
                <div style={{ fontSize: 11, lineHeight: 1.25, overflow: 'hidden' }}>
                  <div style={{
                    color: 'var(--md-sys-color-on-surface)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    fontWeight: n.key === '__other__' ? 400 : 500,
                  }} title={n.label}>
                    {n.label}
                  </div>
                  <div style={{ color: 'var(--md-sys-color-on-surface-variant)', fontWeight: 700 }}>
                    {n.count.toLocaleString()}
                  </div>
                </div>
              </foreignObject>
            </g>
          )
        })}
      </svg>
      {selected && (
        <p className="text-[10px] mt-1 text-[var(--md-sys-color-on-surface-variant)]">
          ノードを再クリックでハイライト解除
        </p>
      )}
    </div>
  )
}
