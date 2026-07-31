import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { exportOperatorsToSheet, importOperatorsFromSheet, extractSpreadsheetId } from '@/lib/sheet-sync'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin', 'superadmin', 'hr'].includes(user?.role)) return null
  return user
}

/** GET: 運営者情報シート同期の設定を取得 */
export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const config = await prisma.googleSheetsConfig.findFirst()
  return NextResponse.json({
    spreadsheetId: config?.operatorSpreadsheetId ?? '',
    sheetName: config?.operatorSheetName ?? '運営者情報',
    serviceAccountEmail: process.env.GOOGLE_SHEETS_CLIENT_EMAIL || null,
  })
}

/** PUT: 運営者情報シート同期の設定を保存（スプレッドシートID/URL・シート名） */
export async function PUT(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const rawId = typeof body.spreadsheetId === 'string' ? body.spreadsheetId.trim() : ''
  const sheetName = (typeof body.sheetName === 'string' ? body.sheetName.trim() : '') || '運営者情報'
  const spreadsheetId = rawId ? extractSpreadsheetId(rawId) : null

  const existing = await prisma.googleSheetsConfig.findFirst()
  if (existing) {
    await prisma.googleSheetsConfig.update({
      where: { id: existing.id },
      data: { operatorSpreadsheetId: spreadsheetId, operatorSheetName: sheetName },
    })
  } else {
    await prisma.googleSheetsConfig.create({
      data: { operatorSpreadsheetId: spreadsheetId, operatorSheetName: sheetName },
    })
  }
  return NextResponse.json({ success: true, spreadsheetId: spreadsheetId ?? '', sheetName })
}

/** POST: 同期を実行（action: 'export' = シートへ出力 / 'import' = シートから取込） */
export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const action = body.action

  if (action === 'export') {
    const result = await exportOperatorsToSheet()
    if (result.success) {
      await recordAccessLog({
        userType: user.role, userId: user.id, userName: user.name,
        action: `運営者情報をスプレッドシートへ出力（${result.exported}件）`, req,
      })
    }
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  }

  if (action === 'import') {
    const result = await importOperatorsFromSheet()
    if (result.success) {
      await recordAccessLog({
        userType: user.role, userId: user.id, userName: user.name,
        action: `運営者情報をスプレッドシートから同期（新規${result.createdCount}・更新${result.updatedCount}・エラー${result.errorCount}）`, req,
      })
    }
    return NextResponse.json(result, { status: result.success ? 200 : 400 })
  }

  return NextResponse.json({ error: '無効なアクションです' }, { status: 400 })
}
