import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { CUSTOMER_TYPES, isCustomerType, stringifyCustomerTypes, type CustomerType } from '@/lib/customer-types'

const VALID_CUSTOMER_TYPES = CUSTOMER_TYPES as readonly string[]

/** body から customerTypes 配列を抽出（不正値は除外）。未指定なら null。 */
function extractCustomerTypes(body: any): CustomerType[] | null {
  if (!Array.isArray(body.customerTypes)) return null
  const list = body.customerTypes.filter(isCustomerType)
  return list
}

/** 顧客の有効化・無効化・タイプ変更 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(sessionUser.role)) {
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

  // 顧客タイプのみ変更（単一 or 複数）
  if (
    Object.keys(body).length === 1 &&
    (
      (body.customerType && VALID_CUSTOMER_TYPES.includes(body.customerType)) ||
      Array.isArray(body.customerTypes)
    )
  ) {
    const types = extractCustomerTypes(body)
    const data: Record<string, unknown> = {}
    if (body.customerType && VALID_CUSTOMER_TYPES.includes(body.customerType)) {
      data.customerType = body.customerType
    }
    if (types) {
      // customerTypes が空配列なら主タイプにフォールバック
      const primary = (data.customerType as string) ?? user.customerType
      data.customerTypes = stringifyCustomerTypes(types, primary)
      // 主タイプ未指定なら配列の先頭を主タイプに昇格
      if (!data.customerType && types.length > 0) data.customerType = types[0]
    }
    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, customerType: true, customerTypes: true },
    })
    return NextResponse.json(updated)
  }

  // 訪問頻度のみ変更
  if (typeof body.visitFrequencyMonths === 'number' && Object.keys(body).length === 1) {
    const freq = Math.max(1, Math.floor(body.visitFrequencyMonths))
    const updated = await prisma.user.update({
      where: { id },
      data: { visitFrequencyMonths: freq },
    })
    return NextResponse.json({ id: updated.id, visitFrequencyMonths: updated.visitFrequencyMonths })
  }

  // 顧客情報の編集（name が含まれていればプロフィール編集とみなす）
  if (typeof body.name === 'string') {
    const data: Record<string, unknown> = {}

    if (body.name?.trim()) data.name = body.name.trim()
    else return NextResponse.json({ error: '氏名は必須です' }, { status: 400 })

    if (typeof body.furigana === 'string') data.furigana = body.furigana.trim()
    if (typeof body.phone === 'string') data.phone = body.phone.replace(/[-ー\s]/g, '')
    if (typeof body.phone2 === 'string') data.phone2 = body.phone2.replace(/[-ー\s]/g, '') || null
    if (typeof body.phone3 === 'string') data.phone3 = body.phone3.replace(/[-ー\s]/g, '') || null
    if (typeof body.address === 'string') data.address = body.address.trim()
    if (typeof body.internalNote === 'string') data.internalNote = body.internalNote.trim() || null

    // email: 空文字なら null にする
    if (typeof body.email === 'string') {
      data.email = body.email.trim() || null
    }

    if (body.customerType && VALID_CUSTOMER_TYPES.includes(body.customerType)) {
      data.customerType = body.customerType
    }

    const types = extractCustomerTypes(body)
    if (types) {
      const primary = (data.customerType as string) ?? user.customerType
      data.customerTypes = stringifyCustomerTypes(types, primary)
      if (!data.customerType && types.length > 0) data.customerType = types[0]
    }

    if (typeof body.visitFrequencyMonths === 'number') {
      data.visitFrequencyMonths = Math.max(1, Math.floor(body.visitFrequencyMonths))
    }

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, furigana: true, email: true, phone: true, phone2: true, phone3: true, address: true, internalNote: true, customerType: true, customerTypes: true, visitFrequencyMonths: true },
    })
    return NextResponse.json(updated)
  }

  // 住所確認の承認・却下
  if ('addressVerified' in body || 'proofDocumentStatus' in body) {
    const data: Record<string, unknown> = {}
    if (typeof body.addressVerified === 'boolean') data.addressVerified = body.addressVerified
    if (typeof body.proofDocumentStatus === 'string') data.proofDocumentStatus = body.proofDocumentStatus

    const updated = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, addressVerified: true, proofDocumentStatus: true },
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
  if (!session || !['admin','superadmin','hr'].includes(sessionUser.role)) {
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
