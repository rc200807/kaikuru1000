import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { reconcileSheetSync } from '@/lib/sheet-sync'

// Google Sheets への書き込みが複数回走るため上限を明示
export const maxDuration = 60

/**
 * POST /api/cron/sync-sheets
 *
 * 店舗・運営者・顧客の「直近に更新されたレコード」をスプレッドシートへ反映する。
 * 変更時の即時反映（各APIのフック）で取りこぼした分を回収するための安全網。
 *
 * 全件書き換えではなく行単位で更新するため、シート側で編集中の他の行や
 * 独自に足した列は壊さない。重複して反映されても実害はない。
 *
 * Vercel Cron で1時間ごとの実行を想定し、窓は2時間分と重ねて取りこぼしを防ぐ。
 */
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await reconcileSheetSync(120)
    const updated = result.stores + result.operators + result.customers
    const pruned = result.pruned.stores + result.pruned.operators + result.pruned.customers

    // 反映・削除があったとき、または警告が出たときだけログを残す
    // （毎時0件のログで SyncLog を埋めない）
    if (updated > 0 || pruned > 0 || result.warnings.length > 0) {
      const parts = [`更新 店舗${result.stores}・運営者${result.operators}・顧客${result.customers}`]
      if (pruned > 0) {
        parts.push(`削除 店舗${result.pruned.stores}・運営者${result.pruned.operators}・顧客${result.pruned.customers}`)
      }
      if (result.warnings.length > 0) parts.push(`警告: ${result.warnings.join(' / ')}`)
      await prisma.syncLog.create({
        data: {
          type: 'sheet-reconcile',
          status: result.warnings.length > 0 ? 'error' : 'success',
          message: parts.join(' / ').slice(0, 1000),
        },
      })
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[cron/sync-sheets] 定期同期に失敗:', message)
    try {
      await prisma.syncLog.create({
        data: { type: 'sheet-reconcile', status: 'error', message: message.slice(0, 1000) },
      })
    } catch { /* ログ保存の失敗で cron 自体を落とさない */ }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
