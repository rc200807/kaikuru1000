import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// ライセンスキー CSVエクスポート（管理者のみ）
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const keys = await prisma.licenseKey.findMany({
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  })

  // CSV行構築（セル内のダブルクォートをエスケープ）
  function escapeCsv(value: string): string {
    return `"${value.replace(/"/g, '""')}"`
  }

  const header = ['キー', '状態', '登録日', '使用者名', '使用者メール']
  const dataRows = keys.map(k => [
    k.key,
    k.isUsed ? '使用済み' : '未使用',
    new Date(k.createdAt).toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }),
    k.user?.name ?? '',
    k.user?.email ?? '',
  ])

  const csv = [header, ...dataRows]
    .map(row => row.map(cell => escapeCsv(String(cell))).join(','))
    .join('\r\n')

  // BOM付きUTF-8（Excelで文字化けしないよう）
  const bom = '\uFEFF'
  const date = new Date().toISOString().slice(0, 10)

  return new NextResponse(bom + csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="license-keys-${date}.csv"`,
    },
  })
}
