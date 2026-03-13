import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 現在の設定を取得（トークンは返さない）
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await prisma.googleSheetsConfig.findFirst()
  if (!config) return NextResponse.json(null)

  return NextResponse.json({
    id: config.id,
    googleEmail: config.googleEmail,
    isConnected: !!config.refreshToken,
    spreadsheetId: config.spreadsheetId,
    sheetName: config.sheetName,
    keyColumn: config.keyColumn,
    tokenExpiry: config.tokenExpiry,
    storeSpreadsheetId: config.storeSpreadsheetId,
    storeSheetName: config.storeSheetName,
  })
}

// スプレッドシート設定を更新
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { spreadsheetId, sheetName, keyColumn, storeSpreadsheetId, storeSheetName } = await request.json()

  const existing = await prisma.googleSheetsConfig.findFirst()
  if (existing) {
    await prisma.googleSheetsConfig.update({
      where: { id: existing.id },
      data: {
        ...(spreadsheetId !== undefined && { spreadsheetId }),
        ...(sheetName !== undefined && { sheetName }),
        ...(keyColumn !== undefined && { keyColumn }),
        ...(storeSpreadsheetId !== undefined && { storeSpreadsheetId }),
        ...(storeSheetName !== undefined && { storeSheetName }),
      },
    })
  } else {
    await prisma.googleSheetsConfig.create({
      data: {
        spreadsheetId,
        sheetName: sheetName || 'ライセンスキー',
        keyColumn: keyColumn || 'A',
        storeSpreadsheetId,
        storeSheetName: storeSheetName || '店舗マスター',
      },
    })
  }

  return NextResponse.json({ success: true })
}

// Googleアカウントの連携を解除（トークンのみ削除、設定は残す）
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await prisma.googleSheetsConfig.findFirst()
  if (config) {
    await prisma.googleSheetsConfig.update({
      where: { id: config.id },
      data: {
        googleEmail: null,
        accessToken: null,
        refreshToken: null,
        tokenExpiry: null,
      },
    })
  }

  return NextResponse.json({ success: true })
}
