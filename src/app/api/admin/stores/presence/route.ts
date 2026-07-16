import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// プレゼンスの有効期間（この時間ハートビートが無ければ退室扱い）
const FRESH_MS = 30_000
// これより古い行は誰のものでも掃除する
const STALE_MS = 60_000
// 1ユーザーが同時に編集中として申告できる店舗数の上限（暴走防止）
const MAX_STORE_IDS = 200

// 店舗一括編集のプレゼンス（表示のみ。編集ロックはしない）
// POST: ハートビート。自分の在室状況を storeIds で申告し、他の管理者の在室状況を返す
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin', 'superadmin', 'hr'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let storeIds: string[] = []
  try {
    const body = await request.json()
    if (Array.isArray(body?.storeIds)) {
      storeIds = body.storeIds.filter((v: unknown) => typeof v === 'string').slice(0, MAX_STORE_IDS)
    }
  } catch {
    // body なしは storeIds=[]（モーダル在室のみ）として扱う
  }

  const now = Date.now()
  await prisma.$transaction([
    // 自分の行を全て入れ替え
    prisma.storeEditPresence.deleteMany({ where: { adminId: user.id } }),
    prisma.storeEditPresence.createMany({
      data: [
        // モーダル在室を表す行（storeId: null）
        { adminId: user.id, adminName: user.name || '管理者', storeId: null },
        ...storeIds.map(storeId => ({
          adminId: user.id,
          adminName: user.name || '管理者',
          storeId,
        })),
      ],
    }),
    // 古い行のオポチュニスティック掃除
    prisma.storeEditPresence.deleteMany({
      where: { lastSeenAt: { lt: new Date(now - STALE_MS) } },
    }),
  ])

  // 自分以外の fresh な在室状況を返す
  const others = await prisma.storeEditPresence.findMany({
    where: {
      adminId: { not: user.id },
      lastSeenAt: { gte: new Date(now - FRESH_MS) },
    },
    select: { adminId: true, adminName: true, storeId: true },
  })

  return NextResponse.json({ others })
}

// DELETE: 退室（モーダルを閉じた時に呼ぶ）
export async function DELETE() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin', 'superadmin', 'hr'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await prisma.storeEditPresence.deleteMany({ where: { adminId: user.id } })
  return NextResponse.json({ ok: true })
}
