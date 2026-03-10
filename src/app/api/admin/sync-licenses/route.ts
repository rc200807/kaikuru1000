import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { google } from 'googleapis'

// スプレッドシートURLからIDを抽出するユーティリティ
function extractSpreadsheetId(input: string): string {
  // URL形式: https://docs.google.com/spreadsheets/d/{ID}/edit
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)
  return match ? match[1] : input // URLでなければそのまま返す
}

// Googleスプレッドシートからライセンスキーをインポート
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await prisma.googleSheetsConfig.findFirst()

  if (!config?.refreshToken) {
    return NextResponse.json(
      { error: 'Googleアカウントが連携されていません。設定ページで連携してください。' },
      { status: 400 }
    )
  }
  if (!config?.spreadsheetId) {
    return NextResponse.json(
      { error: 'スプレッドシートが設定されていません。設定ページで設定してください。' },
      { status: 400 }
    )
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.json(
      { error: 'Google OAuth認証情報が設定されていません（GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET）' },
      { status: 500 }
    )
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXTAUTH_URL}/api/admin/google-callback`
    )

    oauth2Client.setCredentials({
      access_token: config.accessToken,
      refresh_token: config.refreshToken,
    })

    // トークン自動更新をDBに反映
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await prisma.googleSheetsConfig.update({
          where: { id: config.id },
          data: {
            accessToken: tokens.access_token,
            tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
          },
        })
      }
    })

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client })

    // 列インデックス: A=0, B=1, C=2 ...
    const colIdx = config.keyColumn.toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0)
    const spreadsheetId = extractSpreadsheetId(config.spreadsheetId)

    // 2行目から読み込み（1行目はヘッダー想定）
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${config.sheetName}!A2:Z1000`,
    })

    const rows = response.data.values || []
    const keys = rows
      .map((row) => (row[colIdx] || '').trim())
      .filter((k) => k.length > 0)

    if (keys.length === 0) {
      return NextResponse.json({
        success: true,
        created: 0,
        skipped: 0,
        total: 0,
        message: 'スプレッドシートにデータが見つかりませんでした',
      })
    }

    let created = 0
    let skipped = 0

    for (const key of keys) {
      try {
        await prisma.licenseKey.create({ data: { key } })
        created++
      } catch {
        skipped++ // 重複キーはスキップ
      }
    }

    await prisma.syncLog.create({
      data: {
        type: 'licenses',
        status: 'success',
        message: `Imported ${created} license keys (${skipped} duplicates skipped) from "${config.sheetName}"`,
      },
    })

    return NextResponse.json({ success: true, created, skipped, total: keys.length })
  } catch (err: any) {
    const message = err.message || 'Unknown error'
    await prisma.syncLog.create({
      data: { type: 'licenses', status: 'error', message },
    })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
