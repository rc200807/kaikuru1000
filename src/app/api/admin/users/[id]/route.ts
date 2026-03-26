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

  // 有効化・無効化
  if (typeof body.isActive === 'boolean' && Object.keys(body).length === 1) {
    const updated = await prisma.user.update({
      where: { id },
      data: { isActive: body.isActive },
    })
    return NextResponse.json({ id: updated.id, isActive: updated.isActive })
  }

  // 顧客タイプのみ変更
  if (body.customerType && Object.keys(body).length === 1 && VALID_CUSTOMER_TYPES.includes(body.customerType)) {
    const updated = await prisma.user.update({
      where: { id },
      data: { customerType: body.customerType },
    })
    return NextResponse.json({ id: updated.id, customerType: updated.customerType })
  }

  // 顧客情報の編集（name が含まれていればプロフィール編集とみなす）
  if (typeof body.name === 'string') {
    const data: Record<string, unknown> = {}

    if (body.name?.trim()) data.name = body.name.trim()
    else return NextResponse.json({ error: '氏名は必須です' }, { status: 400 })

    if (typeof body.furigana === 'string') data.furigana = body.furigana.trim()
    if (typeof body.phone === 'string') data.phone = body.phone.replace(/[-ー\s]/g, '')
    if (typeof body.address === 'string') data.address = body.address.trim()

    // email: 空文字なら null にする
    if (typeof body.email === 'string') {
      data.email = body.email.trim() || null
    }

    if (body.customerType && VALID_CUSTOMER_TYPES.includes(body.customerType)) {
      data.customerType = body.customerType
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, furigana: true, email: true, phone: true, address: true, customerType: true },
    })
    return NextResponse.json(updated)
  }

  // OCR誤り報告のクリア
  if ('idOcrIssueReport' in body && body.idOcrIssueReport === null) {
    const updated = await prisma.user.update({
      where: { id },
      data: { idOcrIssueReport: null },
      select: { id: true, idOcrIssueReport: true },
    })
    return NextResponse.json(updated)
  }

  // 口座情報の編集（bankInfo キーが含まれていれば口座更新とみなす）
  if ('bankInfo' in body) {
    const data: Record<string, unknown> = {
      bankName:      typeof body.bankName === 'string' ? body.bankName.trim() || null : null,
      branchName:    typeof body.branchName === 'string' ? body.branchName.trim() || null : null,
      accountType:   typeof body.accountType === 'string' ? body.accountType.trim() || null : null,
      accountNumber: typeof body.accountNumber === 'string' ? body.accountNumber.trim() || null : null,
      accountHolder: typeof body.accountHolder === 'string' ? body.accountHolder.trim() || null : null,
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, bankName: true, branchName: true, accountType: true, accountNumber: true, accountHolder: true },
    })
    return NextResponse.json(updated)
  }

  // OCR情報の編集（idName キーが含まれていればOCR更新とみなす）
  if ('idName' in body) {
    const data: Record<string, unknown> = {
      idName:          typeof body.idName === 'string' ? body.idName.trim() || null : null,
      idBirthDate:     typeof body.idBirthDate === 'string' ? body.idBirthDate.trim() || null : null,
      idAddress:       typeof body.idAddress === 'string' ? body.idAddress.trim() || null : null,
      idLicenseNumber: typeof body.idLicenseNumber === 'string' ? body.idLicenseNumber.trim() || null : null,
      idExpiryDate:    typeof body.idExpiryDate === 'string' ? body.idExpiryDate.trim() || null : null,
      idBackAddress:   typeof body.idBackAddress === 'string' ? body.idBackAddress.trim() || null : null,
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, idName: true, idBirthDate: true, idAddress: true, idLicenseNumber: true, idExpiryDate: true, idBackAddress: true },
    })
    return NextResponse.json(updated)
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
