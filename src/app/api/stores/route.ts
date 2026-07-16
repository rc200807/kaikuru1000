import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 無効な文字列（ダッシュのみ、リテラル "\u2014" 等）をnullに正規化
  function cleanVal(v: string | null): string | null {
    if (!v) return null
    const t = v.trim()
    if (!t) return null
    if (/^(\\u[0-9a-fA-F]{4})+$/.test(t)) return null
    if (/^[\s\-\u2014\u2013\u2015\u2212\u30FC\uFF0D]*$/.test(t)) return null
    return t
  }

  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: {
      id: true, name: true, code: true,
      prefecture: true, postalCode: true, address: true, phone: true, email: true,
      storeStatus: true, openingDate: true, closingDate: true,
      googleBusinessUrl: true, oikuraPageUrl: true, lineAddFriendUrl: true, bankInfo: true,
      contractNotifyEmail: true, calendarInviteEmail: true,
      bankName: true, branchName: true, accountType: true, accountNumber: true, accountHolder: true,
      invoiceNumber: true, antiquePermitNumber: true,
      operatorId: true, serviceAreas: true, createdAt: true,
      operator: { select: { id: true, name: true } },
      _count: { select: { customers: true } },
    },
    orderBy: { code: 'asc' },
  })

  // 初回ログイン実績（AccessLog に store の login レコードがあれば「ログイン済み」）
  const ids = stores.map(s => s.id)
  const loginLogs = ids.length
    ? await prisma.accessLog.groupBy({
        by: ['userId'],
        where: { userType: 'store', action: 'login', userId: { in: ids } },
        _max: { createdAt: true },
      })
    : []
  const loginMap = new Map(
    loginLogs.map(l => [l.userId as string, l._max.createdAt] as const),
  )

  // DB に残っている無効値をクリーンアップして返す
  const cleaned = stores.map(s => ({
    ...s,
    prefecture: cleanVal(s.prefecture),
    address: cleanVal(s.address),
    phone: cleanVal(s.phone),
    hasLoggedIn: loginMap.has(s.id),
    lastLoginAt: loginMap.get(s.id) ?? null,
  }))

  return NextResponse.json(cleaned)
}
