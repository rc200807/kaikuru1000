import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildDealNumber, dealNumberPrefix } from '@/lib/deal-number'
import { recordAccessLog } from '@/lib/access-log'

const BATCH = 2000

/**
 * 案件番号の一括採番（未採番の既存案件向け・冪等）。
 * 案件番号の導入時に一度だけ実行する想定。案件を開いたときにも自動採番されるが、
 * それだと同じ日の連番が「開いた順」になるため、こちらは発生日の古い順に振る。
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin', 'superadmin'].includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 既に使われている番号を日付ごとに把握してから、未採番分を古い順に詰める
  const [numbered, targets] = await Promise.all([
    prisma.deal.findMany({
      where: { dealNumber: { not: null } },
      select: { dealNumber: true },
    }),
    prisma.deal.findMany({
      where: { dealNumber: null },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, occurredAt: true, createdAt: true },
      take: BATCH,
    }),
  ])

  const maxSeqByPrefix = new Map<string, number>()
  for (const row of numbered) {
    const num = row.dealNumber!
    const prefix = num.slice(0, 8)
    const seq = Number(num.slice(8))
    if (!Number.isFinite(seq)) continue
    if ((maxSeqByPrefix.get(prefix) ?? 0) < seq) maxSeqByPrefix.set(prefix, seq)
  }

  let assigned = 0
  let failed = 0
  for (const deal of targets) {
    const prefix = dealNumberPrefix(deal.occurredAt ?? deal.createdAt)
    let seq = (maxSeqByPrefix.get(prefix) ?? 0) + 1
    let ok = false
    // 万一の衝突（並行して採番された等）は連番を進めて数回リトライする
    for (let attempt = 0; attempt < 5 && !ok; attempt++, seq++) {
      try {
        const res = await prisma.deal.updateMany({
          where: { id: deal.id, dealNumber: null },
          data: { dealNumber: buildDealNumber(prefix, seq) },
        })
        ok = true
        if (res.count > 0) assigned++
      } catch {
        // 一意制約違反 → 次の連番へ
      }
    }
    maxSeqByPrefix.set(prefix, seq - 1)
    if (!ok) failed++
  }

  const remaining = await prisma.deal.count({ where: { dealNumber: null } })

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: `案件番号を一括採番（${assigned}件）`, req: request,
  })

  return NextResponse.json({ assigned, failed, remaining })
}

/** GET: 未採番の件数だけ返す（実行前の確認用） */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin', 'superadmin'].includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const [total, unnumbered] = await Promise.all([
    prisma.deal.count(),
    prisma.deal.count({ where: { dealNumber: null } }),
  ])
  return NextResponse.json({ total, unnumbered })
}
