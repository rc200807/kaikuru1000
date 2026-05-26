import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePartner } from '@/lib/partner-auth'

/**
 * ライセンスキー集計
 * - 現在アクティブ（startDate あり / endDate なし）の総数
 * - 累計の開始数・終了数
 * - 過去24ヶ月の月別アクティブ累計 / 新規開始 / 終了
 * - 年別の開始数・終了数
 */
export async function GET() {
  const partner = await requirePartner()
  if (!partner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const keys = await prisma.licenseKey.findMany({
    select: { startDate: true, endDate: true, createdAt: true },
  })

  const now = new Date()

  // 1. シンプル集計
  const activeCount = keys.filter(k => k.startDate && !k.endDate).length
  const startedTotal = keys.filter(k => k.startDate).length
  const endedTotal   = keys.filter(k => k.endDate).length
  const neverStartedCount = keys.filter(k => !k.startDate).length

  // 2. 月別集計（過去24ヶ月）
  const monthLabels: string[] = []
  const startsByMonth = new Map<string, number>()
  const endsByMonth   = new Map<string, number>()

  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    monthLabels.push(label)
    startsByMonth.set(label, 0)
    endsByMonth.set(label, 0)
  }

  function monthLabel(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
  }

  for (const k of keys) {
    if (k.startDate) {
      const l = monthLabel(new Date(k.startDate))
      if (startsByMonth.has(l)) startsByMonth.set(l, (startsByMonth.get(l) || 0) + 1)
    }
    if (k.endDate) {
      const l = monthLabel(new Date(k.endDate))
      if (endsByMonth.has(l)) endsByMonth.set(l, (endsByMonth.get(l) || 0) + 1)
    }
  }

  // 累計アクティブ数（各月末時点）— 月の最終日時点でアクティブだったライセンス数
  const cumulativeActive: { month: string; active: number }[] = []
  for (const label of monthLabels) {
    const [y, m] = label.split('-').map(Number)
    const monthEnd = new Date(y, m, 0, 23, 59, 59) // その月の最終日
    const active = keys.filter(k => {
      if (!k.startDate) return false
      if (new Date(k.startDate) > monthEnd) return false
      if (k.endDate && new Date(k.endDate) <= monthEnd) return false
      return true
    }).length
    cumulativeActive.push({ month: label, active })
  }

  // 月別 新規開始 / 終了
  const monthlyChanges = monthLabels.map(label => ({
    month: label,
    started: startsByMonth.get(label) || 0,
    ended:   endsByMonth.get(label)   || 0,
    net:     (startsByMonth.get(label) || 0) - (endsByMonth.get(label) || 0),
  }))

  // 3. 年別集計（過去5年）
  const currentYear = now.getFullYear()
  const yearly: { year: number; started: number; ended: number }[] = []
  for (let y = currentYear - 4; y <= currentYear; y++) {
    yearly.push({
      year: y,
      started: keys.filter(k => k.startDate && new Date(k.startDate).getFullYear() === y).length,
      ended:   keys.filter(k => k.endDate   && new Date(k.endDate).getFullYear()   === y).length,
    })
  }

  // 今年単独
  const thisYearStarted = yearly.find(y => y.year === currentYear)?.started ?? 0
  const thisYearEnded   = yearly.find(y => y.year === currentYear)?.ended   ?? 0

  return NextResponse.json({
    summary: {
      activeCount,
      startedTotal,
      endedTotal,
      neverStartedCount,
      thisYearStarted,
      thisYearEnded,
      totalKeys: keys.length,
    },
    cumulativeActive,
    monthlyChanges,
    yearly,
  })
}
