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
      prefecture: true, address: true, phone: true, email: true,
      _count: { select: { customers: true } },
    },
    orderBy: { code: 'asc' },
  })

  // DB に残っている無効値をクリーンアップして返す
  const cleaned = stores.map(s => ({
    ...s,
    prefecture: cleanVal(s.prefecture),
    address: cleanVal(s.address),
    phone: cleanVal(s.phone),
  }))

  return NextResponse.json(cleaned)
}
