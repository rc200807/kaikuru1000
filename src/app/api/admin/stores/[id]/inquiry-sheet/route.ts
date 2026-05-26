import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import {
  createStoreInquirySpreadsheet,
  shareStoreInquirySpreadsheet,
  backfillStoreInquiriesToSheet,
} from '@/lib/google-sheets'

/** GET: 現在のシート発行状態 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const store = await prisma.store.findUnique({
    where: { id },
    select: {
      inquirySpreadsheetId: true,
      inquirySheetUrl: true,
      inquirySheetSharedEmails: true,
      inquirySheetIssuedAt: true,
    },
  })
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

  let sharedEmails: string[] = []
  try { sharedEmails = JSON.parse(store.inquirySheetSharedEmails || '[]') } catch { /* ignore */ }

  return NextResponse.json({
    spreadsheetId: store.inquirySpreadsheetId,
    url: store.inquirySheetUrl,
    sharedEmails,
    issuedAt: store.inquirySheetIssuedAt,
  })
}

/** POST: 新規スプレッドシート発行（既存があれば 409） */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const store = await prisma.store.findUnique({ where: { id } })
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

  if (store.inquirySpreadsheetId) {
    return NextResponse.json({ error: 'すでにシートが発行されています' }, { status: 409 })
  }

  const body = await req.json().catch(() => ({}))
  const inputEmails: string[] = Array.isArray(body?.shareEmails) ? body.shareEmails : []
  // 店舗アカウントメールがあれば自動追加（重複は除外）
  const seen = new Set<string>()
  const shareEmails: string[] = []
  for (const e of [...inputEmails, store.email].filter(Boolean) as string[]) {
    const trimmed = e.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    shareEmails.push(trimmed)
  }

  const createRes = await createStoreInquirySpreadsheet({
    storeName: store.name,
    storeCode: store.code,
    shareEmails,
  })
  if (!createRes.success || !createRes.spreadsheetId) {
    return NextResponse.json({ error: createRes.message }, { status: 500 })
  }

  // 既存問い合わせをバックフィル
  const backfill = await backfillStoreInquiriesToSheet(createRes.spreadsheetId, store.id)

  // DB に保存
  await prisma.store.update({
    where: { id },
    data: {
      inquirySpreadsheetId: createRes.spreadsheetId,
      inquirySheetUrl:      createRes.url ?? null,
      inquirySheetSharedEmails: JSON.stringify(createRes.sharedEmails ?? []),
      inquirySheetIssuedAt: new Date(),
    },
  })

  return NextResponse.json({
    spreadsheetId: createRes.spreadsheetId,
    url:           createRes.url,
    sharedEmails:  createRes.sharedEmails,
    backfilledCount: backfill.appended,
    backfillMessage: backfill.message,
  })
}

/** PATCH: 共有メールアドレス追加 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await ctx.params
  const store = await prisma.store.findUnique({ where: { id } })
  if (!store) return NextResponse.json({ error: 'Store not found' }, { status: 404 })

  if (!store.inquirySpreadsheetId) {
    return NextResponse.json({ error: 'シートが未発行です' }, { status: 400 })
  }

  const body = await req.json().catch(() => ({}))
  const additionalEmails: string[] = Array.isArray(body?.shareEmails) ? body.shareEmails : []
  if (additionalEmails.length === 0) {
    return NextResponse.json({ error: '追加するメールアドレスがありません' }, { status: 400 })
  }

  // 既存リストとマージ（重複除外）
  let existing: string[] = []
  try { existing = JSON.parse(store.inquirySheetSharedEmails || '[]') } catch { /* ignore */ }
  const seen = new Set(existing)
  const toShare: string[] = []
  for (const e of additionalEmails) {
    const trimmed = e.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    toShare.push(trimmed)
  }

  if (toShare.length === 0) {
    return NextResponse.json({ message: '追加対象なし（既に共有済み）', sharedEmails: existing })
  }

  const shareRes = await shareStoreInquirySpreadsheet(store.inquirySpreadsheetId, toShare)
  if (!shareRes.success) {
    return NextResponse.json({ error: shareRes.message }, { status: 500 })
  }

  const merged = [...existing, ...shareRes.sharedEmails]
  await prisma.store.update({
    where: { id },
    data: { inquirySheetSharedEmails: JSON.stringify(merged) },
  })

  return NextResponse.json({ sharedEmails: merged, addedCount: shareRes.sharedEmails.length })
}
