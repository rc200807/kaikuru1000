import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { WON_STATUSES } from '../../analytics/_lib/params'
import type { PathFlowResult, PathFlowNode, PathFlowLink } from '@/lib/tracking-types'
import { resolveTrackingParams, dateWhere, fetchPageViewsBySessions, FLOW_SESSION_CAP } from '../_lib/common'

export const dynamic = 'force-dynamic'

const MAX_NODES_PER_STEP = 10

// 経路探索フロー図の集計（GA風）。
// ?steps=5&cvOnly=1&reverse=1&channel=search&storeId=xxx&paramKey=utm_source&paramValue=instagram&outcome=won
export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { range } = resolveTrackingParams(request)
  const sp = request.nextUrl.searchParams
  const steps = Math.min(8, Math.max(2, Number(sp.get('steps')) || 5))
  const cvOnly = sp.get('cvOnly') === '1'
  const reverse = sp.get('reverse') === '1'
  const channel = sp.get('channel') || null
  const storeId = sp.get('storeId') || null
  const paramKey = sp.get('paramKey') || null
  const paramValue = sp.get('paramValue') || null
  const wonOnly = sp.get('outcome') === 'won'

  // ─── 対象セッションの決定 ───
  const where: Record<string, unknown> = { startedAt: dateWhere(range) }
  if (channel) where.channel = channel
  if (cvOnly || reverse || wonOnly) where.hasConversion = true
  if (paramKey && paramValue) where.entryParams = { contains: `"${paramKey}":"${paramValue}"` }

  // 店舗絞り込み: その店舗への問い合わせCVが起きたセッション
  if (storeId) {
    const events = await prisma.trackingEvent.findMany({
      where: { storeId, occurredAt: dateWhere(range), sessionId: { not: null } },
      select: { sessionId: true },
    })
    const ids = [...new Set(events.map(e => e.sessionId).filter((v): v is string => !!v))]
    if (ids.length === 0) {
      return NextResponse.json({ totalSessions: 0, truncated: false, steps: [], links: [] } satisfies PathFlowResult)
    }
    where.id = { in: ids.slice(0, FLOW_SESSION_CAP) }
  }

  // 成約のみ: CVイベント→案件（問い合わせ経由 or 顧客経由）が成約しているセッション
  if (wonOnly) {
    const cvEvents = await prisma.trackingEvent.findMany({
      where: { occurredAt: dateWhere(range), type: { in: ['inquiry_submit', 'form_submit'] }, sessionId: { not: null } },
      select: { sessionId: true, inquiryId: true, visitorId: true },
    })
    const inquiryIds = cvEvents.map(e => e.inquiryId).filter((v): v is string => !!v)
    const wonDeals = inquiryIds.length > 0
      ? await prisma.deal.findMany({
          where: { inquiryId: { in: inquiryIds }, status: { in: WON_STATUSES } },
          select: { inquiryId: true },
        })
      : []
    const wonInquiryIds = new Set(wonDeals.map(d => d.inquiryId))
    const wonSessionIds = cvEvents.filter(e => e.inquiryId && wonInquiryIds.has(e.inquiryId)).map(e => e.sessionId!)
    if (wonSessionIds.length === 0) {
      return NextResponse.json({ totalSessions: 0, truncated: false, steps: [], links: [] } satisfies PathFlowResult)
    }
    where.id = { in: [...new Set(wonSessionIds)].slice(0, FLOW_SESSION_CAP) }
  }

  const sessions = await prisma.trackingSession.findMany({
    where,
    select: { id: true },
    orderBy: { startedAt: 'desc' },
    take: FLOW_SESSION_CAP + 1,
  })
  const truncated = sessions.length > FLOW_SESSION_CAP
  const sessionIds = sessions.slice(0, FLOW_SESSION_CAP).map(s => s.id)
  if (sessionIds.length === 0) {
    return NextResponse.json({ totalSessions: 0, truncated: false, steps: [], links: [] } satisfies PathFlowResult)
  }

  // ─── PV列の構築（連続同一パスは畳む） ───
  const pvs = await fetchPageViewsBySessions(sessionIds)
  const seqBySession = new Map<string, { path: string; title: string | null }[]>()
  for (const pv of pvs) {
    let seq = seqBySession.get(pv.sessionId)
    if (!seq) { seq = []; seqBySession.set(pv.sessionId, seq) }
    if (seq.length > 0 && seq[seq.length - 1].path === pv.path) continue // 連続同一を畳む
    if (seq.length >= 30) continue
    seq.push({ path: pv.path, title: pv.title })
  }

  // reverse時はCV直前から遡る（列を末尾から取る）
  const sequences = [...seqBySession.values()]
    .filter(seq => seq.length > 0)
    .map(seq => reverse ? seq.slice(-steps).reverse() : seq.slice(0, steps))

  // ─── ステップ×ノード集計 ───
  const nodeCounts: Map<string, { label: string; count: number }>[] = Array.from({ length: steps }, () => new Map())
  const linkCounts = new Map<string, number>() // `${step}|${fromKey}|${toKey}`
  for (const seq of sequences) {
    for (let i = 0; i < seq.length && i < steps; i++) {
      const node = seq[i]
      const cur = nodeCounts[i].get(node.path) ?? { label: node.title || node.path, count: 0 }
      cur.count++
      if (!cur.label && node.title) cur.label = node.title
      nodeCounts[i].set(node.path, cur)
      if (i > 0) {
        const key = `${i - 1}|${seq[i - 1].path}|${node.path}`
        linkCounts.set(key, (linkCounts.get(key) ?? 0) + 1)
      }
    }
  }

  // 上位Nノード+「他」への丸め
  const keptKeys: Set<string>[] = []
  const resultSteps: PathFlowResult['steps'] = []
  for (let i = 0; i < steps; i++) {
    const entries = [...nodeCounts[i].entries()].sort((a, b) => b[1].count - a[1].count)
    if (entries.length === 0) break
    const kept = entries.slice(0, MAX_NODES_PER_STEP)
    const others = entries.slice(MAX_NODES_PER_STEP)
    const nodes: PathFlowNode[] = kept.map(([key, v]) => ({ key, label: v.label, count: v.count }))
    if (others.length > 0) {
      nodes.push({ key: '__other__', label: `他 ${others.length} ページ`, count: others.reduce((s, [, v]) => s + v.count, 0), isOther: true })
    }
    keptKeys.push(new Set(kept.map(([key]) => key)))
    resultSteps.push({ index: i, nodes })
  }

  const links: PathFlowLink[] = []
  const linkAgg = new Map<string, number>()
  for (const [key, count] of linkCounts) {
    const [stepStr, fromKey, toKey] = key.split('|')
    const step = Number(stepStr)
    if (step + 1 >= resultSteps.length) continue
    const from = keptKeys[step]?.has(fromKey) ? fromKey : '__other__'
    const to = keptKeys[step + 1]?.has(toKey) ? toKey : '__other__'
    const aggKey = `${step}|${from}|${to}`
    linkAgg.set(aggKey, (linkAgg.get(aggKey) ?? 0) + count)
  }
  for (const [key, count] of linkAgg) {
    const [stepStr, fromKey, toKey] = key.split('|')
    links.push({ fromStep: Number(stepStr), fromKey, toKey, count })
  }

  const result: PathFlowResult = {
    totalSessions: sequences.length,
    truncated,
    steps: resultSteps,
    links,
  }
  return NextResponse.json(result)
}
