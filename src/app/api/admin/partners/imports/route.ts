import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'

/** セールスパートナーによる顧客CSVインポート履歴一覧 */
export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const imports = await prisma.partnerCustomerImport.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { partner: { select: { id: true, name: true, email: true } } },
  })
  return NextResponse.json(imports)
}
