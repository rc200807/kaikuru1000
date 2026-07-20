import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { jstDateKey } from '@/lib/datetime'
import { dateFromJstStr, addDaysStr } from '@/lib/analytics/period'
import { commentStoreAlerts } from '@/lib/analytics/ai'
import type { StoreAlertsResult, StoreAlert } from '@/lib/analytics/types'
import { WON_STATUSES } from '../../_lib/params'
import { guardAiRequest, makeCacheKey, findCached, saveInsight, aiErrorResponse } from '../_lib/common'

export const dynamic = 'force-dynamic'

type WindowMetrics = { deals: number; won: number; purchase: number; logins: number }

function pctChange(recent: number, previous: number): number {
  if (previous === 0) return recent > 0 ? 100 : 0
  return ((recent - previous) / previous) * 100
}

// A3 店舗不調予兆: 直近4週 vs その前4週の店舗別指標をJS比較し、悪化店舗をAIが解説
export async function POST(request: NextRequest) {
  const guard = await guardAiRequest()
  if (guard instanceof NextResponse) return guard

  try {
    const body = await request.json().catch(() => ({})) as { force?: boolean }
    const todayStr = jstDateKey(new Date())

    const cacheParams = { day: todayStr }
    const cacheKey = makeCacheKey('store_alerts', cacheParams)
    const cached = await findCached<StoreAlertsResult>('store_alerts', cacheKey, body.force === true)
    if (cached) return NextResponse.json({ content: cached.content, cached: true, generatedAt: cached.generatedAt })

    const recentStart = dateFromJstStr(addDaysStr(todayStr, -28))
    const prevStart = dateFromJstStr(addDaysStr(todayStr, -56))
    const tomorrow = dateFromJstStr(addDaysStr(todayStr, 1))

    const [stores, deals, logins] = await Promise.all([
      prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
      prisma.deal.findMany({
        where: { occurredAt: { gte: prevStart, lt: tomorrow } },
        select: { storeId: true, occurredAt: true, status: true, purchaseAmount: true },
      }),
      prisma.accessLog.findMany({
        where: { createdAt: { gte: prevStart, lt: tomorrow }, userType: 'store', action: 'login' },
        select: { userId: true, createdAt: true },
      }),
    ])

    const storeNameMap = new Map(stores.map(s => [s.id, s.name]))
    const metrics = new Map<string, { recent: WindowMetrics; previous: WindowMetrics }>()
    const ensure = (storeId: string) => {
      let m = metrics.get(storeId)
      if (!m) {
        m = { recent: { deals: 0, won: 0, purchase: 0, logins: 0 }, previous: { deals: 0, won: 0, purchase: 0, logins: 0 } }
        metrics.set(storeId, m)
      }
      return m
    }

    for (const d of deals) {
      if (!d.storeId || !storeNameMap.has(d.storeId)) continue
      const m = ensure(d.storeId)[d.occurredAt >= recentStart ? 'recent' : 'previous']
      m.deals++
      if (WON_STATUSES.includes(d.status)) { m.won++; m.purchase += d.purchaseAmount ?? 0 }
    }
    for (const l of logins) {
      if (!l.userId || !storeNameMap.has(l.userId)) continue
      const m = ensure(l.userId)[l.createdAt >= recentStart ? 'recent' : 'previous']
      m.logins++
    }

    // 悪化度スコア: 前4週に実績があり、直近4週で案件・買取額・ログインが下がっている店舗
    const candidates = [...metrics.entries()]
      .filter(([, m]) => m.previous.deals >= 2 || m.previous.purchase > 0)
      .map(([storeId, m]) => {
        const dealChange = pctChange(m.recent.deals, m.previous.deals)
        const purchaseChange = pctChange(m.recent.purchase, m.previous.purchase)
        const loginChange = pctChange(m.recent.logins, m.previous.logins)
        const score = Math.min(0, dealChange) + Math.min(0, purchaseChange) + Math.min(0, loginChange) * 0.5
        return { storeId, m, dealChange, purchaseChange, loginChange, score }
      })
      .filter(c => c.score < -30)
      .sort((a, b) => a.score - b.score)
      .slice(0, 5)

    let content: StoreAlertsResult
    if (candidates.length === 0) {
      content = { summary: '直近4週間で大きく失速している店舗は検出されませんでした。', alerts: [] }
    } else {
      const alertRows = candidates.map(c => ({
        store: storeNameMap.get(c.storeId) ?? '不明',
        recent4w: c.m.recent,
        previous4w: c.m.previous,
        changes: { deals: `${c.dealChange.toFixed(0)}%`, purchase: `${c.purchaseChange.toFixed(0)}%`, logins: `${c.loginChange.toFixed(0)}%` },
      }))
      const ai = await commentStoreAlerts(alertRows)
      const alerts: StoreAlert[] = candidates.map((c, i) => ({
        store: storeNameMap.get(c.storeId) ?? '不明',
        severity: c.score < -100 ? 'bad' : 'warn',
        metrics: [
          { name: '案件数', recent: c.m.recent.deals, previous: c.m.previous.deals, changePercent: c.dealChange },
          { name: '買取金額', recent: c.m.recent.purchase, previous: c.m.previous.purchase, changePercent: c.purchaseChange },
          { name: 'ログイン数', recent: c.m.recent.logins, previous: c.m.previous.logins, changePercent: c.loginChange },
        ],
        hypothesis: ai.perStore[i]?.hypothesis ?? '',
        action: ai.perStore[i]?.action ?? '',
      }))
      content = { summary: ai.summary, alerts }
    }

    const createdAt = await saveInsight({ kind: 'store_alerts', cacheKey, params: cacheParams, content, adminId: guard.admin.id })
    return NextResponse.json({ content, cached: false, generatedAt: createdAt.toISOString() })
  } catch (err) {
    return aiErrorResponse(err)
  }
}
