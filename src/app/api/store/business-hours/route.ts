import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { masterJson } from '@/lib/api-cache'

// GET: 営業時間を取得（顧客は担当店舗、店舗は自店舗）
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: '未認証' }, { status: 401 })

  const sessionUser = session.user as any
  let store

  if (sessionUser.role === 'store') {
    // 店舗ユーザー → 自分の店舗
    store = await prisma.store.findUnique({
      where: { id: sessionUser.id },
      select: {
        businessHoursStart: true,
        businessHoursEnd: true,
        businessDays: true,
      },
    })
  } else if (sessionUser.role === 'customer') {
    // 顧客 → 担当店舗
    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      select: { storeId: true },
    })
    if (!user?.storeId) {
      return NextResponse.json({ error: '担当店舗が未設定です' }, { status: 404 })
    }
    store = await prisma.store.findUnique({
      where: { id: user.storeId },
      select: {
        businessHoursStart: true,
        businessHoursEnd: true,
        businessDays: true,
      },
    })
  } else {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!store) {
    return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
  }

  return masterJson({
    businessHoursStart: store.businessHoursStart ?? '09:00',
    businessHoursEnd: store.businessHoursEnd ?? '18:00',
    businessDays: store.businessDays ?? '[0,1,2,3,4,5,6]',
  })
}

// PATCH: 営業時間を更新（店舗ユーザーのみ）
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: '未認証' }, { status: 401 })

  const sessionUser = session.user as any
  if (sessionUser.role !== 'store') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { businessHoursStart, businessHoursEnd, businessDays } = body

  // バリデーション: 時刻形式 HH:MM
  const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/
  if (businessHoursStart && !timeRegex.test(businessHoursStart)) {
    return NextResponse.json({ error: '開始時間の形式が不正です' }, { status: 400 })
  }
  if (businessHoursEnd && !timeRegex.test(businessHoursEnd)) {
    return NextResponse.json({ error: '終了時間の形式が不正です' }, { status: 400 })
  }

  // バリデーション: 営業曜日は数値配列のJSON文字列
  if (businessDays) {
    try {
      const parsed = JSON.parse(businessDays)
      if (!Array.isArray(parsed) || !parsed.every((d: unknown) => typeof d === 'number' && d >= 0 && d <= 6)) {
        return NextResponse.json({ error: '営業曜日の形式が不正です' }, { status: 400 })
      }
    } catch {
      return NextResponse.json({ error: '営業曜日の形式が不正です' }, { status: 400 })
    }
  }

  const updateData: Record<string, string> = {}
  if (businessHoursStart) updateData.businessHoursStart = businessHoursStart
  if (businessHoursEnd) updateData.businessHoursEnd = businessHoursEnd
  if (businessDays) updateData.businessDays = businessDays

  const updated = await prisma.store.update({
    where: { id: sessionUser.id },
    data: updateData,
    select: {
      businessHoursStart: true,
      businessHoursEnd: true,
      businessDays: true,
    },
  })

  return NextResponse.json(updated)
}
