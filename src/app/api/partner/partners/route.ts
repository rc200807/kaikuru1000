import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePartner } from '@/lib/partner-auth'

/** セールスパートナー一覧（ログイン中の全パートナーから閲覧可。
 *  パスワードなど機密情報は返さない。） */
export async function GET() {
  const user = await requirePartner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const partners = await prisma.salesPartner.findMany({
    where: { isActive: true, acceptedAt: { not: null } },
    select: {
      id: true,
      name: true,
      email: true,
      acceptedAt: true,
      createdAt: true,
    },
    orderBy: { acceptedAt: 'desc' },
  })

  return NextResponse.json(partners.map(p => ({ ...p, isMe: p.id === user.id })))
}
