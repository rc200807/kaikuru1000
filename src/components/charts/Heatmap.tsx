'use client'

// 曜日×時間帯のヒートマップ（訪問集中時間の可視化）
type Props = {
  /** grid[weekday(0=日)][hourIndex] = count */
  grid: number[][]
  hourStart: number
  color?: string
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export default function Heatmap({ grid, hourStart, color = '79,142,247' }: Props) {
  const max = Math.max(...grid.flat(), 1)
  const hours = grid[0]?.length ?? 0

  if (hours === 0) {
    return <p className="text-sm text-center py-8 text-[var(--md-sys-color-on-surface-variant)]">データがありません</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 2 }}>
        <thead>
          <tr>
            <th />
            {Array.from({ length: hours }, (_, i) => (
              <th key={i} className="text-[9px] font-normal text-[var(--md-sys-color-on-surface-variant)] pb-1">
                {hourStart + i}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* 月曜始まりで表示 */}
          {[1, 2, 3, 4, 5, 6, 0].map(weekday => (
            <tr key={weekday}>
              <td className="text-[10px] pr-1.5 text-[var(--md-sys-color-on-surface-variant)]">{WEEKDAYS[weekday]}</td>
              {grid[weekday].map((count, i) => (
                <td key={i}>
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center text-[9px] tabular-nums"
                    style={{
                      background: count > 0 ? `rgba(${color},${0.15 + (count / max) * 0.85})` : 'var(--md-sys-color-surface-container-high, #f0f0f0)',
                      color: count / max > 0.55 ? '#fff' : 'var(--md-sys-color-on-surface-variant)',
                    }}
                    title={`${WEEKDAYS[weekday]}曜 ${hourStart + i}時: ${count}件`}
                  >
                    {count > 0 ? count : ''}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
