import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listCalendars } from '@/lib/google-calendar'

// 連携済みGoogleアカウントのカレンダー一覧を取得
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const calendars = await listCalendars(sessionUser.id)

    if (calendars === null) {
      return NextResponse.json(
        { error: 'Googleカレンダーが連携されていないか、認証が無効です。再連携をお試しください。' },
        { status: 400 }
      )
    }

    return NextResponse.json({ calendars })
  } catch (err: any) {
    console.error('[GoogleCalendar] カレンダー一覧API エラー:', err?.message || err)
    return NextResponse.json(
      { error: 'カレンダー一覧の取得中にエラーが発生しました' },
      { status: 500 }
    )
  }
}
