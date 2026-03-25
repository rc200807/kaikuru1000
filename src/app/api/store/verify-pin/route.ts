import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST: PINを検証
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: '未認証' }, { status: 401 })

  const storeId = (session.user as any).id
  const { pin } = await req.json()

  if (!pin) {
    return NextResponse.json({ valid: false, error: '暗証番号を入力してください' }, { status: 400 })
  }

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { lockPin: true },
  })

  if (!store?.lockPin) {
    // PINが未設定の場合はロックなし
    return NextResponse.json({ valid: true })
  }

  const valid = store.lockPin === pin
  return NextResponse.json({ valid })
}
