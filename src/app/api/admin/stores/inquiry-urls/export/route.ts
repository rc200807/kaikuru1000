import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildCsv } from '@/lib/csv-parser'

/**
 * 店舗ごとの問い合わせフォームURL一覧をCSVでダウンロード
 * 列: 店舗コード / 店舗名 / 都道府県 / 住所 / メール / ステータス / 問い合わせフォームURL
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stores = await prisma.store.findMany({
    select: {
      code: true, name: true, prefecture: true, address: true, email: true,
      storeStatus: true, isActive: true,
    },
    orderBy: { code: 'asc' },
  })

  const baseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'

  const headers = ['店舗コード', '店舗名', '都道府県', '住所', 'メール', 'ステータス', '問い合わせフォームURL']
  const rows = stores.map(s => [
    s.code,
    s.name,
    s.prefecture ?? '',
    s.address ?? '',
    s.email ?? '',
    !s.isActive ? '無効' : s.storeStatus === 'closed' ? '閉店' : '営業中',
    `${baseUrl}/inquiry/${s.code}`,
  ])

  const csv = buildCsv([headers, ...rows])
  const filename = `store-inquiry-urls-${new Date().toISOString().slice(0, 10)}.csv`

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
