import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { PASSWORD_REGEX, PASSWORD_ERROR } from '@/lib/passwordValidation'

const VALID_CUSTOMER_TYPES = ['visit', 'delivery', 'regular', 'akikuru'] as const

const updateUserSchema = z.object({
  name:             z.string().min(1).max(100).optional(),
  furigana:         z.string().min(1).max(100).optional(),
  email:            z.string().email().nullable().optional().or(z.literal('')),
  phone:            z.string().max(20).optional(),
  phone2:           z.string().max(20).nullable().optional(),
  phone3:           z.string().max(20).nullable().optional(),
  address:          z.string().max(200).optional(),
  currentPassword:  z.string().optional(),
  newPassword:      z.string().regex(PASSWORD_REGEX, PASSWORD_ERROR).optional(),
  idOcrIssueReport: z.string().max(1000).nullable().optional(), // 顧客によるOCR誤り報告
  // 内部メモ（store / admin のみ）
  internalNote:     z.string().max(2000).nullable().optional(),
  // 顧客種別（store / admin のみ）
  customerType:     z.enum(VALID_CUSTOMER_TYPES).optional(),
  customerTypes:    z.array(z.enum(VALID_CUSTOMER_TYPES)).optional(),
  visitFrequencyMonths: z.number().int().min(1).max(60).optional(),
  // 振込先口座情報
  bankName:      z.string().max(50).nullable().optional(),
  branchName:    z.string().max(50).nullable().optional(),
  accountType:   z.enum(['普通', '当座']).nullable().optional(),
  accountNumber: z.string().max(10).nullable().optional(),
  accountHolder: z.string().max(100).nullable().optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  // 顧客は自分の情報のみ、管理者・店舗はすべて取得可
  if (sessionUser.role === 'customer' && sessionUser.id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      licenseKey: true,
      store: true,
      visitSchedules: {
        orderBy: { visitDate: 'asc' },
        where: { visitDate: { gte: new Date() } },
        take: 3,
      },
    },
  })

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // パスワードは除外 / 身分証 Blob URL をプロキシ URL に変換（URL 露出防止）
  const { password: _, internalNote, ...userWithoutPassword } = user
  return NextResponse.json({
    ...userWithoutPassword,
    // 内部メモは顧客には返さない（店舗・管理者のみ）
    ...(sessionUser.role !== 'customer' ? { internalNote } : {}),
    idDocumentPath: user.idDocumentPath ? `/api/users/${id}/id-document` : null,
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  if (sessionUser.role === 'customer' && sessionUser.id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = updateUserSchema.safeParse(body)
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message ?? 'バリデーションエラー'
    return NextResponse.json({ error }, { status: 400 })
  }

  const { name, furigana, email, phone, phone2, phone3, address, currentPassword, newPassword, idOcrIssueReport,
          internalNote, customerType, customerTypes, visitFrequencyMonths,
          bankName, branchName, accountType, accountNumber, accountHolder } = parsed.data

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const updateData: any = {}
  if (name) updateData.name = name
  if (furigana) updateData.furigana = furigana
  // メール: 空文字なら null
  if (email !== undefined) updateData.email = (email && typeof email === 'string') ? email.trim() : null
  if (phone !== undefined) updateData.phone = phone.replace(/[-ー\s]/g, '')
  if (phone2 !== undefined) updateData.phone2 = phone2 ? phone2.trim() : null
  if (phone3 !== undefined) updateData.phone3 = phone3 ? phone3.trim() : null
  if (address !== undefined) updateData.address = address.trim()
  // OCR誤り報告（null は削除、文字列は更新）
  if (idOcrIssueReport !== undefined) updateData.idOcrIssueReport = idOcrIssueReport
  // 内部メモ（顧客自身は更新不可。店舗/管理者のみ）
  if (internalNote !== undefined && sessionUser.role !== 'customer') {
    updateData.internalNote = internalNote ? internalNote.trim() : null
  }
  // 顧客種別（顧客自身は更新不可。店舗/管理者のみ）
  if (sessionUser.role !== 'customer') {
    if (customerType !== undefined) updateData.customerType = customerType
    if (customerTypes !== undefined) {
      // 配列を JSON 文字列に変換（主タイプを必ず含める）
      const primary = customerType ?? user.customerType
      const set = Array.from(new Set([...(customerTypes ?? []), primary]))
      updateData.customerTypes = JSON.stringify(set)
    }
    if (visitFrequencyMonths !== undefined) updateData.visitFrequencyMonths = visitFrequencyMonths
  }
  // 振込先口座情報
  if (bankName      !== undefined) updateData.bankName      = bankName
  if (branchName    !== undefined) updateData.branchName    = branchName
  if (accountType   !== undefined) updateData.accountType   = accountType
  if (accountNumber !== undefined) updateData.accountNumber = accountNumber
  if (accountHolder !== undefined) updateData.accountHolder = accountHolder

  // パスワード変更
  if (newPassword && currentPassword) {
    const isValid = await bcrypt.compare(currentPassword, user.password)
    if (!isValid) {
      return NextResponse.json({ error: '現在のパスワードが間違っています' }, { status: 400 })
    }
    updateData.password = await bcrypt.hash(newPassword, 10)
  }

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
  })

  const { password: _, ...userWithoutPassword } = updated
  return NextResponse.json(userWithoutPassword)
}
