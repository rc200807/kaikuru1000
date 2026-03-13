import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// テストデータ件数を返す
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const userCount = await prisma.user.count({ where: { isTestData: true } })

  const testUsers = await prisma.user.findMany({
    where: { isTestData: true },
    select: { id: true },
  })
  const userIds = testUsers.map(u => u.id)

  const visitCount = userIds.length > 0
    ? await prisma.visitSchedule.count({ where: { userId: { in: userIds } } })
    : 0

  const licenseKeyCount = await prisma.licenseKey.count({
    where: { key: { startsWith: 'KK-TEST-' } },
  })

  return NextResponse.json({ userCount, visitCount, licenseKeyCount })
}

// テストデータ一括削除
export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const testUsers = await prisma.user.findMany({
    where: { isTestData: true },
    select: { id: true, licenseKeyId: true },
  })

  if (testUsers.length === 0) {
    return NextResponse.json({ deletedVisits: 0, deletedUsers: 0, deletedLicenseKeys: 0 })
  }

  const userIds = testUsers.map(u => u.id)
  const licenseKeyIds = testUsers.map(u => u.licenseKeyId)

  // FK制約に従い順番に削除（トランザクション）
  const [deletedVisits, deletedUsers, deletedLicenseKeys] = await prisma.$transaction([
    prisma.visitSchedule.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.user.deleteMany({ where: { isTestData: true } }),
    prisma.licenseKey.deleteMany({ where: { id: { in: licenseKeyIds } } }),
  ])

  return NextResponse.json({
    deletedVisits: deletedVisits.count,
    deletedUsers: deletedUsers.count,
    deletedLicenseKeys: deletedLicenseKeys.count,
  })
}
