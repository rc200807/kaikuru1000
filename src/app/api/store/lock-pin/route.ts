import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET: PINが設定されているかどうかを返す（PIN自体は返さない）
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: '未認証' }, { status: 401 })

  const storeId = (session.user as any).id
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { lockPin: true },
  })

  return NextResponse.json({ hasPin: !!store?.lockPin })
}

// PATCH: PINを設定・更新
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: '未認証' }, { status: 401 })

  const storeId = (session.user as any).id
  const { pin } = await req.json()

  // バリデーション: 4〜6桁の数字
  if (!pin || !/^\d{4,6}$/.test(pin)) {
    return NextResponse.json({ error: '暗証番号は4〜6桁の数字で入力してください' }, { status: 400 })
  }

  await prisma.store.update({
    where: { id: storeId },
    data: { lockPin: pin },
  })

  return NextResponse.json({ success: true })
}

// DELETE: PINを削除
export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: '未認証' }, { status: 401 })

  const storeId = (session.user as any).id

  await prisma.store.update({
    where: { id: storeId },
    data: { lockPin: null },
  })

  return NextResponse.json({ success: true })
}
