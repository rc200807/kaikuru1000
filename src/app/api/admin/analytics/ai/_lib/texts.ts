// 自由記述テキストの収集（チャットのナレッジツール / テキストマイニングで共用）。
// 個人情報保護のため氏名・連絡先フィールドは取得しない（本文テキストのみ）。
import { prisma } from '@/lib/prisma'
import type { DateRange } from '@/lib/analytics/period'
import { LOST_STATUSES } from '../../_lib/params'

export type FreeText = { source: 'inquiry' | 'deal' | 'lost' | 'memo'; text: string }

const TEXT_MAX_CHARS = 300

function clip(s: string): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > TEXT_MAX_CHARS ? `${t.slice(0, TEXT_MAX_CHARS)}…` : t
}

/** 期間内の自由記述テキストを収集（問い合わせ・案件メモ・失注案件メモ・買取相談） */
export async function collectFreeTexts(range: DateRange, storeId: string | null): Promise<FreeText[]> {
  const dateWhere = { gte: range.from, lt: range.to }

  const [inquiries, deals, lostDeals, memos] = await Promise.all([
    prisma.inquiry.findMany({
      where: { createdAt: dateWhere, details: { not: null }, ...(storeId ? { storeId } : {}) },
      select: { details: true, inquiryType: true },
      orderBy: { createdAt: 'desc' },
      take: 80,
    }),
    prisma.deal.findMany({
      where: { occurredAt: dateWhere, detail: { not: null }, status: { notIn: LOST_STATUSES }, ...(storeId ? { storeId } : {}) },
      select: { detail: true, status: true, category: true },
      orderBy: { occurredAt: 'desc' },
      take: 60,
    }),
    prisma.deal.findMany({
      where: { occurredAt: dateWhere, detail: { not: null }, status: { in: LOST_STATUSES }, ...(storeId ? { storeId } : {}) },
      select: { detail: true, status: true },
      orderBy: { occurredAt: 'desc' },
      take: 30,
    }),
    prisma.purchaseMemo.findMany({
      where: { createdAt: dateWhere },
      select: { title: true, description: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
  ])

  const texts: FreeText[] = []
  for (const i of inquiries) {
    if (i.details) texts.push({ source: 'inquiry', text: clip(`[${i.inquiryType}] ${i.details}`) })
  }
  for (const d of deals) {
    if (d.detail) texts.push({ source: 'deal', text: clip(d.detail) })
  }
  for (const d of lostDeals) {
    if (d.detail) texts.push({ source: 'lost', text: clip(`[${d.status}] ${d.detail}`) })
  }
  for (const m of memos) {
    const body = [m.title, m.description].filter(Boolean).join(': ')
    if (body) texts.push({ source: 'memo', text: clip(body) })
  }
  return texts.slice(0, 200)
}
