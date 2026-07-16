import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// 自分（ログイン中の管理者）の最新ステータスを返す。
// オンボーディング/承認待ちページのポーリング用（JWTは古いことがあるためDBの最新値を返す）。
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await prisma.admin.findUnique({
    where: { id: user.id },
    select: { status: true, authMethod: true },
  })
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ status: admin.status, authMethod: admin.authMethod })
}
