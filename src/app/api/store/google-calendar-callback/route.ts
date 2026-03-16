import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encrypt'

function getRedirectUri() {
  return `${process.env.NEXTAUTH_URL}/api/store/google-calendar-callback`
}

// Google Calendar OAuth2 コールバック: code を受け取りトークン交換してDBに保存（店舗用）
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  const profileUrl = `${process.env.NEXTAUTH_URL}/store/profile`

  if (error || !code || !state) {
    return NextResponse.redirect(`${profileUrl}?gcal=error`)
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(`${profileUrl}?gcal=error`)
  }

  // state パラメータから storeId をデコード
  let storeId: string
  try {
    const parsed = JSON.parse(Buffer.from(state, 'base64url').toString())
    storeId = parsed.storeId
    if (!storeId) throw new Error('Missing storeId')
  } catch {
    console.error('[GoogleCalendar] state パラメータのパースに失敗')
    return NextResponse.redirect(`${profileUrl}?gcal=error`)
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      getRedirectUri()
    )

    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    // 連携したGoogleアカウントのメールアドレスを取得
    const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2Client })
    const { data: userInfo } = await oauth2Api.userinfo.get()

    // DB に upsert
    // アクセストークン・リフレッシュトークンはAES-256-GCMで暗号化して保存
    const tokenData = {
      googleEmail: userInfo.email ?? null,
      accessToken: tokens.access_token ? encrypt(tokens.access_token) : null,
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      isEnabled: true,
    }

    const existing = await prisma.storeGoogleCalendar.findUnique({
      where: { storeId },
    })

    if (existing) {
      await prisma.storeGoogleCalendar.update({
        where: { storeId },
        data: {
          ...tokenData,
          // refresh_token は新規取得時のみ更新（再認証しない場合は null になることがある）
          refreshToken: tokens.refresh_token
            ? encrypt(tokens.refresh_token)
            : existing.refreshToken,
        },
      })
    } else {
      await prisma.storeGoogleCalendar.create({
        data: {
          storeId,
          ...tokenData,
        },
      })
    }

    return NextResponse.redirect(`${profileUrl}?gcal=connected`)
  } catch (err: any) {
    console.error('[GoogleCalendar] OAuth callback error:', err)
    return NextResponse.redirect(`${profileUrl}?gcal=error`)
  }
}
