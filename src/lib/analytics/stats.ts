// 分析AI機能で使う純JS統計（予測・異常検知・RFM・What-if）。
// 数値はすべてここで決定的に計算し、AIには「解釈と提案」だけをさせる方針。

export type ForecastPoint = {
  label: string
  value: number      // 予測中央値
  low: number        // 悲観（-1σ）
  high: number       // 楽観（+1σ）
}

/**
 * 単回帰 + 直近加重によるシンプル予測。
 * series は時系列順の値。horizon 期先までの予測と残差σを返す。
 */
export function linearForecast(values: number[], horizon: number): { points: { value: number; low: number; high: number }[]; slope: number } {
  const n = values.length
  if (n < 3) {
    const last = values[n - 1] ?? 0
    return { points: Array.from({ length: horizon }, () => ({ value: last, low: last * 0.7, high: last * 1.3 })), slope: 0 }
  }
  // 直近ほど重い加重最小二乗（重み: 1..n を線形）
  let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0
  for (let i = 0; i < n; i++) {
    const w = i + 1
    sw += w; swx += w * i; swy += w * values[i]; swxx += w * i * i; swxy += w * i * values[i]
  }
  const denom = sw * swxx - swx * swx
  const slope = denom !== 0 ? (sw * swxy - swx * swy) / denom : 0
  const intercept = (swy - slope * swx) / sw
  // 残差σ
  let ssr = 0
  for (let i = 0; i < n; i++) {
    const fit = intercept + slope * i
    ssr += (values[i] - fit) ** 2
  }
  const sigma = Math.sqrt(ssr / Math.max(1, n - 2))
  const points = Array.from({ length: horizon }, (_, k) => {
    const x = n + k
    const value = Math.max(0, intercept + slope * x)
    // 先の期間ほど不確実性を広げる
    const spread = sigma * Math.sqrt(1 + (k + 1) * 0.25)
    return { value: Math.round(value), low: Math.round(Math.max(0, value - spread)), high: Math.round(value + spread) }
  })
  return { points, slope }
}

/**
 * 当期間の途中経過から着地を線形ペース換算で予測。
 * elapsedRatio: 期間の経過割合（0〜1）
 */
export function paceProjection(currentValue: number, elapsedRatio: number): number {
  if (elapsedRatio <= 0) return currentValue
  return Math.round(currentValue / Math.min(1, elapsedRatio))
}

export type Anomaly = {
  index: number
  label: string
  value: number
  expected: number   // 平均
  zScore: number
  direction: 'spike' | 'drop'
}

function median(sorted: number[]): number {
  const n = sorted.length
  return n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2
}

/**
 * 修正zスコア（中央値+MAD）による異常検知。外れ値自身が分散を膨らませる
 * 素朴なzスコアの弱点を避けるロバスト版。threshold は修正zスコアの閾値（一般に3.5）。
 */
export function detectAnomalies(points: { label: string; value: number }[], threshold = 3.5, maxCount = 5): Anomaly[] {
  const values = points.map(p => p.value)
  const n = values.length
  if (n < 6) return []
  const med = median([...values].sort((a, b) => a - b))
  const mad = median(values.map(v => Math.abs(v - med)).sort((a, b) => a - b))
  // MAD=0（値がほぼ一定）の場合は平均/標準偏差にフォールバック
  let score: (v: number) => number
  if (mad > 0) {
    score = v => (0.6745 * (v - med)) / mad
  } else {
    const mean = values.reduce((s, v) => s + v, 0) / n
    const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / n)
    if (sd === 0) return []
    score = v => (v - mean) / sd
  }
  return points
    .map((p, index) => ({
      index,
      label: p.label,
      value: p.value,
      expected: Math.round(med),
      zScore: score(p.value),
      direction: (p.value >= med ? 'spike' : 'drop') as 'spike' | 'drop',
    }))
    .filter(a => Math.abs(a.zScore) >= threshold)
    .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))
    .slice(0, maxCount)
}

/* ─── RFM セグメント ─────────────────────────────── */

export type RfmInput = {
  userId: string
  name: string
  lastVisitAt: Date | null   // 最終完了訪問
  frequency: number          // 完了訪問回数
  monetary: number           // 累計買取額
  cycleMonths: number        // 設定上の訪問サイクル（visitFrequencyMonths）
}

export type RfmSegmentKey = 'vip' | 'stable' | 'growing' | 'at_risk' | 'dormant' | 'new'

export const RFM_SEGMENT_LABEL: Record<RfmSegmentKey, string> = {
  vip: '優良顧客',
  stable: '安定顧客',
  growing: '育成中',
  at_risk: '離反危機',
  dormant: '休眠',
  new: '未取引',
}

export type RfmSegment = {
  key: RfmSegmentKey
  label: string
  count: number
  totalAmount: number
  avgFrequency: number
  examples: { name: string; monetary: number; monthsSinceLast: number | null }[]
}

/**
 * 訪問サイクル基準のRFMセグメント分類。
 * - new: 完了訪問なし
 * - dormant: サイクルの3倍超過
 * - at_risk: サイクルの1.5倍超過
 * - vip: 訪問3回以上 かつ 累計10万円以上（期限内）
 * - stable: 訪問2回以上（期限内）
 * - growing: 上記以外（期限内・訪問1回）
 */
export function computeRfm(rows: RfmInput[], now: Date): RfmSegment[] {
  const buckets = new Map<RfmSegmentKey, RfmInput[]>()
  const monthsSince = (d: Date | null) => d ? (now.getTime() - d.getTime()) / (30.44 * 86_400_000) : null

  for (const row of rows) {
    let key: RfmSegmentKey
    const since = monthsSince(row.lastVisitAt)
    const cycle = Math.max(1, row.cycleMonths)
    if (row.frequency === 0 || since === null) key = 'new'
    else if (since > cycle * 3) key = 'dormant'
    else if (since > cycle * 1.5) key = 'at_risk'
    else if (row.frequency >= 3 && row.monetary >= 100_000) key = 'vip'
    else if (row.frequency >= 2) key = 'stable'
    else key = 'growing'
    const list = buckets.get(key) ?? []
    list.push(row)
    buckets.set(key, list)
  }

  const order: RfmSegmentKey[] = ['vip', 'stable', 'growing', 'at_risk', 'dormant', 'new']
  return order.map(key => {
    const list = buckets.get(key) ?? []
    const totalAmount = list.reduce((s, r) => s + r.monetary, 0)
    return {
      key,
      label: RFM_SEGMENT_LABEL[key],
      count: list.length,
      totalAmount,
      avgFrequency: list.length > 0 ? list.reduce((s, r) => s + r.frequency, 0) / list.length : 0,
      examples: list
        .sort((a, b) => b.monetary - a.monetary)
        .slice(0, 3)
        .map(r => ({
          name: r.name,
          monetary: r.monetary,
          monthsSinceLast: monthsSince(r.lastVisitAt) !== null ? Math.round(monthsSince(r.lastVisitAt)! * 10) / 10 : null,
        })),
    }
  }).filter(s => s.count > 0)
}

/* ─── What-if 試算 ─────────────────────────────── */

export type WhatIfBase = {
  dealCount: number       // 期間内案件数
  contractRate: number    // 成約率(0-1)
  avgDealAmount: number   // 平均案件単価
  newCustomers: number
}

export type WhatIfChange = {
  metric: 'contractRate' | 'avgDealAmount' | 'dealCount' | 'newCustomers'
  changePercent: number   // +10 = 10%増
}

export type WhatIfResult = {
  base: { wonCount: number; revenue: number }
  projected: { wonCount: number; revenue: number }
  delta: { wonCount: number; revenue: number; revenuePercent: number }
  applied: WhatIfChange[]
}

/** 売上 = 案件数 × 成約率 × 平均単価 の単純モデルで試算（新規顧客増は案件数に比例反映） */
export function whatIfProjection(base: WhatIfBase, changes: WhatIfChange[]): WhatIfResult {
  let dealCount = base.dealCount
  let contractRate = base.contractRate
  let avgAmount = base.avgDealAmount
  for (const c of changes) {
    const factor = 1 + c.changePercent / 100
    if (c.metric === 'dealCount') dealCount *= factor
    if (c.metric === 'contractRate') contractRate = Math.min(1, contractRate * factor)
    if (c.metric === 'avgDealAmount') avgAmount *= factor
    if (c.metric === 'newCustomers' && base.newCustomers > 0) {
      // 新規顧客の増加は案件数に同率で寄与すると仮定
      dealCount *= factor
    }
  }
  const baseWon = base.dealCount * base.contractRate
  const baseRevenue = baseWon * base.avgDealAmount
  const projWon = dealCount * contractRate
  const projRevenue = projWon * avgAmount
  return {
    base: { wonCount: Math.round(baseWon), revenue: Math.round(baseRevenue) },
    projected: { wonCount: Math.round(projWon), revenue: Math.round(projRevenue) },
    delta: {
      wonCount: Math.round(projWon - baseWon),
      revenue: Math.round(projRevenue - baseRevenue),
      revenuePercent: baseRevenue > 0 ? ((projRevenue - baseRevenue) / baseRevenue) * 100 : 0,
    },
    applied: changes,
  }
}
