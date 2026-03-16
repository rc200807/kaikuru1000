import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// GET - リンク済み店舗アカウント一覧
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  if (sessionUser.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const storeId = sessionUser.id

  // 自分がリンク元 or リンク先のレコードを取得
  const links = await prisma.storeLink.findMany({
    where: {
      OR: [
        { storeId },
        { linkedStoreId: storeId },
      ],
    },
    include: {
      store: { select: { id: true, name: true, code: true, avatar: true } },
      linkedStore: { select: { id: true, name: true, code: true, avatar: true } },
    },
  })

  // 現在の店舗情報
  const currentStore = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, name: true, code: true, avatar: true },
  })

  // リンク先の店舗を抽出（自分以外の方を返す）
  const linkedStores = links.map((link) => {
    if (link.storeId === storeId) {
      return link.linkedStore
    }
    return link.store
  })

  // 重複除去
  const uniqueMap = new Map<string, typeof linkedStores[number]>()
  for (const s of linkedStores) {
    if (!uniqueMap.has(s.id)) uniqueMap.set(s.id, s)
  }

  return NextResponse.json({
    currentStore,
    linkedStores: Array.from(uniqueMap.values()),
  })
}

// POST - 店舗アカウントをリンク
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  if (sessionUser.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const storeId = sessionUser.id

  const body = await request.json()
  const { email, password } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'メールアドレスとパスワードを入力してください' }, { status: 400 })
  }

  // リンク先の店舗を検索
  const targetStore = await prisma.store.findFirst({
    where: { email },
  })

  if (!targetStore) {
    return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
  }

  // 自分自身へのリンクは不可
  if (targetStore.id === storeId) {
    return NextResponse.json({ error: '自分自身にはリンクできません' }, { status: 400 })
  }

  // パスワード検証
  const isValid = await bcrypt.compare(password, targetStore.password)
  if (!isValid) {
    return NextResponse.json({ error: 'パスワードが正しくありません' }, { status: 401 })
  }

  // 既にリンク済みか確認
  const existingLink = await prisma.storeLink.findUnique({
    where: {
      storeId_linkedStoreId: { storeId, linkedStoreId: targetStore.id },
    },
  })

  if (existingLink) {
    return NextResponse.json({ error: '既にリンク済みです' }, { status: 409 })
  }

  // 双方向リンクを作成
  await prisma.$transaction([
    prisma.storeLink.create({
      data: { storeId, linkedStoreId: targetStore.id },
    }),
    prisma.storeLink.create({
      data: { storeId: targetStore.id, linkedStoreId: storeId },
    }),
  ])

  return NextResponse.json({
    linkedStore: {
      id: targetStore.id,
      name: targetStore.name,
      code: targetStore.code,
      avatar: targetStore.avatar,
    },
  })
}

// DELETE - 店舗アカウントのリンクを解除
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  if (sessionUser.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const storeId = sessionUser.id

  const body = await request.json()
  const { linkedStoreId } = body

  if (!linkedStoreId) {
    return NextResponse.json({ error: 'linkedStoreId が必要です' }, { status: 400 })
  }

  // 双方向のリンクを削除
  await prisma.$transaction([
    prisma.storeLink.deleteMany({
      where: { storeId, linkedStoreId },
    }),
    prisma.storeLink.deleteMany({
      where: { storeId: linkedStoreId, linkedStoreId: storeId },
    }),
  ])

  return NextResponse.json({ success: true })
}
