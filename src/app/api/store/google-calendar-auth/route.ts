import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { google } from 'googleapis'

function getRedirectUri() {
  return `${process.env.NEXTAUTH_URL}/api/store/google-calendar-callback`
}

// Google Calendar OAuth2 認証URLを生成してリダイレクト（店舗用）
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    return NextResponse.redirect(
      `${process.env.NEXTAUTH_URL}/store/profile?gcal=error`
    )
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  )

  // storeId を state パラメータにエンコード（セキュリティ検証用）
  const state = Buffer.from(JSON.stringify({ storeId: sessionUser.id })).toString('base64url')

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    prompt: 'consent', // 毎回同意画面を表示してrefresh_tokenを確実に取得
    state,
  })

  return NextResponse.redirect(authUrl)
}
