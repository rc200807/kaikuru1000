import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAddressMatch } from '@/lib/address-utils'
import { z } from 'zod'

/**
 * 身分証OCR結果の確認・編集
 * 店舗スタッフが目視でOCR結果を確認し、必要なら修正した上で保存する。
 * applyToProfile=true なら User.name / User.address も上書きする。
 */
const schema = z.object({
  idName:           z.string().min(1).max(100),
  idAddress:        z.string().min(1).max(200),
  idBirthDate:      z.string().max(50).nullable().optional(),
  idDocumentType:   z.string().max(50).nullable().optional(),
  idLicenseNumber:  z.string().max(50).nullable().optional(),
  applyToProfile:   z.boolean().default(false), // 後方互換（全項目を顧客情報へ反映）
  // 項目別に顧客情報へ反映するか（未指定時は applyToProfile にフォールバック）
  applyName:        z.boolean().optional(),
  applyAddress:     z.boolean().optional(),
  applyBirthDate:   z.boolean().optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  if (sessionUser.role === 'customer' && sessionUser.id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message ?? 'バリデーションエラー'
    return NextResponse.json({ error }, { status: 400 })
  }

  const { idName, idAddress, idBirthDate, idDocumentType, idLicenseNumber, applyToProfile } = parsed.data
  // 項目別フラグ（未指定は applyToProfile にフォールバック＝後方互換）
  const applyName = parsed.data.applyName ?? applyToProfile
  const applyAddress = parsed.data.applyAddress ?? applyToProfile
  const applyBirthDate = parsed.data.applyBirthDate ?? applyToProfile

  const user = await prisma.user.findUnique({ where: { id }, select: { address: true } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const updateData: any = {
    idName,
    idAddress,
    idOcrIssueReport: null,
  }
  if (idBirthDate !== undefined) updateData.idBirthDate = idBirthDate
  if (idDocumentType !== undefined) updateData.idDocumentType = idDocumentType
  // 運転免許証など、免許番号が確認・修正された場合は内部の売買記録用に保存
  if (idLicenseNumber !== undefined) updateData.idLicenseNumber = idLicenseNumber

  // 選択された項目のみ顧客プロフィールへ反映
  if (applyName) updateData.name = idName
  if (applyBirthDate && idBirthDate) updateData.birthDate = idBirthDate
  if (applyAddress) {
    updateData.address = idAddress
    updateData.addressMismatch = false
    updateData.addressVerified = true
  } else {
    // 住所を反映しない場合は登録住所との一致を再計算
    const compareAgainst = user.address
    if (compareAgainst) {
      const matched = isAddressMatch(compareAgainst, idAddress)
      updateData.addressMismatch = !matched
      updateData.addressVerified = matched
    }
  }

  await prisma.user.update({ where: { id }, data: updateData })

  return NextResponse.json({ success: true, appliedName: applyName, appliedAddress: applyAddress, appliedBirthDate: applyBirthDate })
}
