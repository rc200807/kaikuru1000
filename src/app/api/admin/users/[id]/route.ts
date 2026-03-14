import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** 顧客の有効化・無効化 */
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

  if (body.customerType === 'visit' || body.customerType === 'delivery') {
    const updated = await prisma.user.update({
      where: { id },
      data: { customerType: body.customerType },
    })
    return NextResponse.json({ id: updated.id, customerType: updated.customerType })
  }

  return NextResponse.json({ error: '無効なリクエスト' }, { status: 400 })
}

/** 顧客を物理削除（訪問履歴も含めて削除し、ライセンスキーを解放） */
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

  await prisma.$transaction([
    // 訪問スケジュールを先に削除（FK制約）
    prisma.visitSchedule.deleteMany({ where: { userId: id } }),
    // ライセンスキーを未使用に戻す
    prisma.licenseKey.update({
      where: { id: user.licenseKeyId },
      data: { isUsed: false },
    }),
    // 顧客を削除
    prisma.user.delete({ where: { id } }),
  ])

  return NextResponse.json({ deleted: true })
}
