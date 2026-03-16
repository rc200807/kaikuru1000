import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 現在のカレンダー設定を取得（トークンは返さない）
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await prisma.storeGoogleCalendar.findUnique({
    where: { storeId: sessionUser.id },
    select: {
      googleEmail: true,
      calendarId: true,
      calendarName: true,
      isEnabled: true,
    },
  })

  if (!config) {
    return NextResponse.json({ connected: false })
  }

  return NextResponse.json({ connected: true, ...config })
}

// カレンダー設定を更新（calendarId, calendarName, isEnabled）
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { calendarId, calendarName, isEnabled } = body

  const existing = await prisma.storeGoogleCalendar.findUnique({
    where: { storeId: sessionUser.id },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Googleカレンダーが連携されていません' }, { status: 404 })
  }

  const updateData: any = {}
  if (calendarId !== undefined) updateData.calendarId = calendarId
  if (calendarName !== undefined) updateData.calendarName = calendarName
  if (isEnabled !== undefined) updateData.isEnabled = isEnabled

  const updated = await prisma.storeGoogleCalendar.update({
    where: { storeId: sessionUser.id },
    data: updateData,
    select: {
      googleEmail: true,
      calendarId: true,
      calendarName: true,
      isEnabled: true,
    },
  })

  return NextResponse.json(updated)
}

// Googleカレンダー連携を解除
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const existing = await prisma.storeGoogleCalendar.findUnique({
    where: { storeId: sessionUser.id },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Googleカレンダーが連携されていません' }, { status: 404 })
  }

  await prisma.storeGoogleCalendar.delete({
    where: { storeId: sessionUser.id },
  })

  return NextResponse.json({ success: true })
}
