import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { CHANNEL_LABEL } from '@/lib/tracking'
import { WON_STATUSES } from '../../analytics/_lib/params'
import type { DealResultsData } from '@/lib/tracking-types'
import { resolveTrackingParams, dateWhere, fetchSessions, parseJsonSafe, urlToPath } from '../_lib/common'

export const dynamic = 'force-dynamic'

// 成果分析: アクセス計測 × 案件データの掛け合わせ
// セッション → 問い合わせCV → 案件化 → 成約 → 買取金額 を一気通貫で集計する
export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { range } = resolveTrackingParams(request)

  const [{ sessions }, cvEvents, campaigns] = await Promise.all([
    fetchSessions(range),
    prisma.trackingEvent.findMany({
      where: { occurredAt: dateWhere(range), type: { in: ['inquiry_submit', 'form_submit'] } },
      select: { id: true, sessionId: true, visitorId: true, inquiryId: true, storeId: true, occurredAt: true },
    }),
    prisma.trackingCampaign.findMany({ orderBy: { createdAt: 'desc' } }),
  ])

  // ─── CVイベント → 案件の解決 ───
  const inquiryIds = cvEvents.map(e => e.inquiryId).filter((v): v is string => !!v)
  const visitorIds = [...new Set(cvEvents.map(e => e.visitorId))]
  const [inquiryDeals, visitors] = await Promise.all([
    inquiryIds.length > 0
      ? prisma.deal.findMany({
          where: { inquiryId: { in: inquiryIds } },
          select: { id: true, inquiryId: true, status: true, purchaseAmount: true, occurredAt: true, userId: true },
        })
      : Promise.resolve([]),
    visitorIds.length > 0
      ? prisma.trackingVisitor.findMany({
          where: { id: { in: visitorIds } },
          select: { id: true, userId: true, firstSeenAt: true },
        })
      : Promise.resolve([]),
  ])
  const visitorMap = new Map(visitors.map(v => [v.id, v]))

  // form_submit（inquiryIdなし）は visitor.userId → 期間内の案件で補完
  const formUserIds = [...new Set(
    cvEvents.filter(e => !e.inquiryId).map(e => visitorMap.get(e.visitorId)?.userId).filter((v): v is string => !!v)
  )]
  const userDeals = formUserIds.length > 0
    ? await prisma.deal.findMany({
        where: { userId: { in: formUserIds }, occurredAt: dateWhere(range) },
        select: { id: true, inquiryId: true, status: true, purchaseAmount: true, occurredAt: true, userId: true },
      })
    : []

  const dealByInquiry = new Map(inquiryDeals.map(d => [d.inquiryId, d]))
  const dealsByUser = new Map<string, typeof userDeals>()
  for (const d of userDeals) {
    const list = dealsByUser.get(d.userId) ?? []
    list.push(d)
    dealsByUser.set(d.userId, list)
  }

  // CVイベントごとに紐付く案件（重複カウント防止のため dealId 単位で1回だけ数える）
  type Linked = { event: typeof cvEvents[number]; deal: { id: string; status: string; purchaseAmount: number | null; occurredAt: Date } | null }
  const seenDealIds = new Set<string>()
  const linked: Linked[] = cvEvents.map(event => {
    let deal = event.inquiryId ? (dealByInquiry.get(event.inquiryId) ?? null) : null
    if (!deal) {
      const userId = visitorMap.get(event.visitorId)?.userId
      if (userId) {
        const candidates = dealsByUser.get(userId) ?? []
        deal = candidates.find(d => !seenDealIds.has(d.id)) ?? null
      }
    }
    if (deal) {
      if (seenDealIds.has(deal.id)) deal = null
      else seenDealIds.add(deal.id)
    }
    return { event, deal }
  })

  const isWon = (s: string) => WON_STATUSES.includes(s)
  const sessionById = new Map(sessions.map(s => [s.id, s]))

  // ─── フルファネル ───
  const dealCount = linked.filter(l => l.deal).length
  const wonDeals = linked.filter(l => l.deal && isWon(l.deal.status))
  const totalAmount = wonDeals.reduce((s, l) => s + (l.deal!.purchaseAmount ?? 0), 0)
  const funnel = [
    { name: 'セッション', count: sessions.length },
    { name: '問い合わせCV', count: cvEvents.length },
    { name: '案件化', count: dealCount },
    { name: '成約', count: wonDeals.length },
  ]

  // ─── チャネル×案件成果 ───
  const channelAgg = new Map<string, { sessions: number; inquiries: number; deals: number; won: number; amount: number }>()
  const ensureChannel = (ch: string) => {
    let a = channelAgg.get(ch)
    if (!a) { a = { sessions: 0, inquiries: 0, deals: 0, won: 0, amount: 0 }; channelAgg.set(ch, a) }
    return a
  }
  for (const s of sessions) ensureChannel(s.channel ? (CHANNEL_LABEL[s.channel] ?? s.channel) : '不明').sessions++
  for (const l of linked) {
    const sess = l.event.sessionId ? sessionById.get(l.event.sessionId) : null
    const ch = sess?.channel ? (CHANNEL_LABEL[sess.channel] ?? sess.channel) : '不明'
    const agg = ensureChannel(ch)
    agg.inquiries++
    if (l.deal) {
      agg.deals++
      if (isWon(l.deal.status)) { agg.won++; agg.amount += l.deal.purchaseAmount ?? 0 }
    }
  }
  const channelResults = [...channelAgg.entries()]
    .map(([channel, v]) => ({ channel, ...v }))
    .sort((a, b) => b.amount - a.amount || b.inquiries - a.inquiries)

  // ─── ランディングページ別の案件品質 ───
  const lpAgg = new Map<string, { inquiries: number; deals: number; won: number; amount: number }>()
  for (const l of linked) {
    const sess = l.event.sessionId ? sessionById.get(l.event.sessionId) : null
    const lp = sess ? (urlToPath(sess.entryUrl) ?? '不明') : '（計測外）'
    let a = lpAgg.get(lp)
    if (!a) { a = { inquiries: 0, deals: 0, won: 0, amount: 0 }; lpAgg.set(lp, a) }
    a.inquiries++
    if (l.deal) {
      a.deals++
      if (isWon(l.deal.status)) { a.won++; a.amount += l.deal.purchaseAmount ?? 0 }
    }
  }
  const landingResults = [...lpAgg.entries()]
    .map(([path, v]) => ({ path, ...v }))
    .sort((a, b) => b.inquiries - a.inquiries)
    .slice(0, 20)

  // ─── 店舗別サマリー ───
  const storeAgg = new Map<string, { conversions: number; deals: number; won: number; amount: number; channels: Map<string, number> }>()
  for (const l of linked) {
    const storeId = l.event.storeId ?? '__none__'
    let a = storeAgg.get(storeId)
    if (!a) { a = { conversions: 0, deals: 0, won: 0, amount: 0, channels: new Map() }; storeAgg.set(storeId, a) }
    a.conversions++
    const sess = l.event.sessionId ? sessionById.get(l.event.sessionId) : null
    if (sess?.channel) {
      const ch = CHANNEL_LABEL[sess.channel] ?? sess.channel
      a.channels.set(ch, (a.channels.get(ch) ?? 0) + 1)
    }
    if (l.deal) {
      a.deals++
      if (isWon(l.deal.status)) { a.won++; a.amount += l.deal.purchaseAmount ?? 0 }
    }
  }
  const storeIdList = [...storeAgg.keys()].filter(id => id !== '__none__')
  const storeRows = storeIdList.length > 0
    ? await prisma.store.findMany({ where: { id: { in: storeIdList } }, select: { id: true, name: true } })
    : []
  const storeNameMap = new Map(storeRows.map(s => [s.id, s.name]))
  const storeResults = [...storeAgg.entries()]
    .map(([storeId, v]) => ({
      storeId,
      store: storeId === '__none__' ? '店舗なし（フォーム等）' : (storeNameMap.get(storeId) ?? '不明'),
      conversions: v.conversions,
      deals: v.deals,
      won: v.won,
      amount: v.amount,
      topChannel: [...v.channels.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    }))
    .sort((a, b) => b.conversions - a.conversions)

  // ─── キャンペーン×売上 ───
  const campaignResults = []
  for (const c of campaigns) {
    const params = parseJsonSafe<Record<string, string>>(c.params, {})
    const entries = Object.entries(params)
    if (entries.length === 0) continue
    const matches = (entryParams: string) => entries.every(([k, v]) => entryParams.includes(`"${k}":"${v}"`))
    const campaignSessions = sessions.filter(s => matches(s.entryParams))
    const sessionIdSet = new Set(campaignSessions.map(s => s.id))
    const campaignLinked = linked.filter(l => l.event.sessionId && sessionIdSet.has(l.event.sessionId))
    const campaignWon = campaignLinked.filter(l => l.deal && isWon(l.deal.status))
    campaignResults.push({
      name: c.name,
      sessions: campaignSessions.length,
      conversions: campaignLinked.length,
      deals: campaignLinked.filter(l => l.deal).length,
      won: campaignWon.length,
      amount: campaignWon.reduce((s, l) => s + (l.deal!.purchaseAmount ?? 0), 0),
    })
  }

  // ─── リードタイム（チャネル別: 初回訪問→問い合わせ / 初回訪問→成約） ───
  const leadAgg = new Map<string, { toInquiry: number[]; toWon: number[] }>()
  for (const l of linked) {
    const sess = l.event.sessionId ? sessionById.get(l.event.sessionId) : null
    const ch = sess?.channel ? (CHANNEL_LABEL[sess.channel] ?? sess.channel) : '不明'
    const visitor = visitorMap.get(l.event.visitorId)
    if (!visitor) continue
    let a = leadAgg.get(ch)
    if (!a) { a = { toInquiry: [], toWon: [] }; leadAgg.set(ch, a) }
    a.toInquiry.push((l.event.occurredAt.getTime() - visitor.firstSeenAt.getTime()) / 86_400_000)
    if (l.deal && isWon(l.deal.status)) {
      a.toWon.push((l.deal.occurredAt.getTime() - visitor.firstSeenAt.getTime()) / 86_400_000)
    }
  }
  const avg = (arr: number[]) => arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null
  const leadTimes = [...leadAgg.entries()].map(([channel, v]) => ({
    channel,
    avgDaysToInquiry: avg(v.toInquiry),
    avgDaysToWon: avg(v.toWon),
    count: v.toInquiry.length,
  }))

  const result: DealResultsData = { funnel, channelResults, landingResults, storeResults, campaignResults, leadTimes, totalAmount }
  return NextResponse.json(result)
}
