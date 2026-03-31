import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createCalendar } from '@/lib/google-calendar'
import { prisma } from '@/lib/prisma'

// 新しいGoogleカレンダーを作成して店舗に設定
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const calendarName = body.calendarName?.trim()

    if (!calendarName) {
      return NextResponse.json(
        { error: 'カレンダー名を入力してください' },
        { status: 400 }
      )
    }

    const storeId = sessionUser.id
    const result = await createCalendar(storeId, calendarName)

    if (!result) {
      return NextResponse.json(
        { error: 'カレンダーの作成に失敗しました。Googleカレンダーの連携状態を確認してください。' },
        { status: 400 }
      )
    }

    // 作成したカレンダーを店舗のカレンダー設定に反映
    await prisma.storeGoogleCalendar.update({
      where: { storeId },
      data: {
        calendarId: result.id,
        calendarName: result.name,
      },
    })

    return NextResponse.json({ id: result.id, name: result.name })
  } catch (err: any) {
    console.error('[GoogleCalendar] カレンダー作成API エラー:', err?.message || err)
    return NextResponse.json(
      { error: 'カレンダーの作成中にエラーが発生しました' },
      { status: 500 }
    )
  }
}
