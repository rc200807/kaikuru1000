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
    const total = result.stores + result.operators + result.customers

    // 反映対象があったときだけログを残す（毎時0件のログでSyncLogを埋めない）
    if (total > 0) {
      await prisma.syncLog.create({
        data: {
          type: 'sheet-reconcile',
          status: 'success',
          message: `店舗${result.stores}・運営者${result.operators}・顧客${result.customers}件を反映`,
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
