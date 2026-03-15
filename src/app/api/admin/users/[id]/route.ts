import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const VALID_CUSTOMER_TYPES = ['visit', 'delivery', 'regular']

/** 顧客の有効化・無効化・タイプ変更 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return NextResponse.json({ error: '顧客が見つかりません' }, { status: 404 })

  if (typeof body.isActive === 'boolean') {
    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: body.isActive },
    })
    return NextResponse.json({ id: updated.id, isActive: updated.isActive })
  }

  if (VALID_CUSTOMER_TYPES.includes(body.customerType)) {
    const updated = await prisma.user.update({
      where: { id },
      data: { customerType: body.customerType },
    })
    return NextResponse.json({ id: updated.id, customerType: updated.customerType })
  }

  return NextResponse.json({ error: '無効なリクエスト' }, { status: 400 })
}

/** 顧客を物理削除（訪問履歴も含めて削除し、ライセンスキーがあれば解放） */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, licenseKeyId: true },
  })
  if (!user) return NextResponse.json({ error: '顧客が見つかりません' }, { status: 404 })

  // トランザクションで関連データを削除
  const operations: any[] = [
    // 訪問スケジュール関連の品目は onDelete: Cascade で自動削除される
    prisma.visitSchedule.deleteMany({ where: { userId: id } }),
  ]

  // ライセンスキーがある場合のみ解放
  if (user.licenseKeyId) {
    operations.push(
      prisma.licenseKey.update({
        where: { id: user.licenseKeyId },
        data: { isUsed: false },
      })
    )
  }

  operations.push(prisma.user.delete({ where: { id } }))

  await prisma.$transaction(operations)

  return NextResponse.json({ deleted: true })
}
