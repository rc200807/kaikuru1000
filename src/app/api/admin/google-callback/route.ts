import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encrypt'

function getRedirectUri() {
  return `${process.env.NEXTAUTH_URL}/api/admin/google-callback`
}

// Google OAuth2 コールバック: code を受け取りトークン交換してDBに保存
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  const settingsUrl = `${process.env.NEXTAUTH_URL}/admin/settings`

  if (error || !code) {
    return NextResponse.redirect(`${settingsUrl}?error=oauth_denied`)
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(`${settingsUrl}?error=no_credentials`)
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

    // DB に upsert（設定は1レコードのみ）
    // アクセストークン・リフレッシュトークンはAES-256-GCMで暗号化して保存
    const existing = await prisma.googleSheetsConfig.findFirst()
    const tokenData = {
      googleEmail: userInfo.email ?? null,
      accessToken:  tokens.access_token  ? encrypt(tokens.access_token)  : null,
      refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
      tokenExpiry: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
    }

    if (existing) {
      await prisma.googleSheetsConfig.update({
        where: { id: existing.id },
        data: {
          ...tokenData,
          // refresh_token は新規取得時のみ更新（再認証しない場合は null になることがある）
          refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : existing.refreshToken,
        },
      })
    } else {
      await prisma.googleSheetsConfig.create({ data: tokenData })
    }

    return NextResponse.redirect(`${settingsUrl}?success=connected`)
  } catch (err: any) {
    console.error('Google OAuth callback error:', err)
    return NextResponse.redirect(`${settingsUrl}?error=token_failed`)
  }
}
