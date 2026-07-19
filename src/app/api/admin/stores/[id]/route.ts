import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { recordAccessLog } from '@/lib/access-log'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { sendStorePasswordResetNotification } from '@/lib/mailer'
import { operatorInheritedValues } from '@/lib/operator-store-sync'

function generatePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(12)
  return Array.from(bytes).map(b => chars[b % chars.length]).join('')
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (!['admin','superadmin','hr'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const body = await request.json()

  const store = await prisma.store.findUnique({ where: { id } })
  if (!store) return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })

  if (body.resetPassword) {
    const plainPassword = generatePassword()
    const hashedPassword = await bcrypt.hash(plainPassword, 10)
    await prisma.store.update({
      where: { id },
      data: { password: hashedPassword },
    })
    return NextResponse.json({ password: plainPassword, hasEmail: !!store.email })
  }

  if (body.sendPasswordEmail) {
    if (!store.email) {
      return NextResponse.json({ error: 'メールアドレスが設定されていません' }, { status: 400 })
    }
    if (!body.password || typeof body.password !== 'string') {
      return NextResponse.json({ error: 'パスワードが指定されていません' }, { status: 400 })
    }
    try {
      const loginUrl = `${process.env.NEXTAUTH_URL ?? ''}/store/login`
      const sent = await sendStorePasswordResetNotification({
        storeEmail: store.email,
        storeName: store.name,
        newPassword: body.password,
        loginUrl,
      })
      if (!sent) {
        return NextResponse.json(
          { error: 'メール送信機能が無効です。設定画面でSMTP設定を確認してください。' },
          { status: 503 },
        )
      }
      return NextResponse.json({ sent: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'メール送信に失敗しました'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  // 店舗詳細情報の更新
  if (body.updateDetails) {
    const allowedFields = [
      'name', 'email', 'phone', 'address', 'postalCode', 'prefecture',
      'storeStatus', 'openingDate', 'closingDate',
      'googleBusinessUrl', 'oikuraPageUrl', 'lineAddFriendUrl', 'bankInfo',
      'bankName', 'branchName', 'accountType', 'accountNumber', 'accountHolder',
      'invoiceNumber', 'antiquePermitNumber', 'contractNotifyEmail', 'calendarInviteEmail',
      'serviceAreas',
    ] as const
    const data: Record<string, any> = {}
    for (const field of allowedFields) {
      if (field in body) {
        if (field === 'openingDate' || field === 'closingDate') {
          data[field] = body[field] ? new Date(body[field]) : null
        } else {
          data[field] = body[field] || null
        }
      }
    }

    // 運営者の割り当て（operatorId）。空文字は未割り当て(null)扱い
    let effectiveOperatorId: string | null = store.operatorId
    if ('operatorId' in body) {
      const opId = (typeof body.operatorId === 'string' && body.operatorId.trim()) ? body.operatorId.trim() : null
      if (opId) {
        const exists = await prisma.operator.findUnique({ where: { id: opId }, select: { id: true } })
        if (!exists) return NextResponse.json({ error: '指定された運営者が見つかりません' }, { status: 400 })
      }
      data.operatorId = opId
      effectiveOperatorId = opId
    }

    // 運営者が割り当てられている場合、継承項目（銀行口座/古物許可番号/インボイス番号）は運営者を「正」とする。
    // クライアントから当該項目が送られてきても運営者の値で上書き（防御的措置。UI 上も読み取り専用）。
    if (effectiveOperatorId) {
      const op = await prisma.operator.findUnique({
        where: { id: effectiveOperatorId },
        select: {
          bankName: true, branchName: true, accountType: true, accountNumber: true, accountHolder: true,
          antiquePermitNumber: true, invoiceNumber: true,
        },
      })
      if (op) Object.assign(data, operatorInheritedValues(op))
    }

    const updated = await prisma.store.update({
      where: { id },
      data,
      select: {
        id: true, code: true, name: true,
        email: true, phone: true, prefecture: true, postalCode: true, address: true,
        storeStatus: true, openingDate: true, closingDate: true,
        googleBusinessUrl: true, oikuraPageUrl: true, lineAddFriendUrl: true, bankInfo: true,
        bankName: true, branchName: true, accountType: true, accountNumber: true, accountHolder: true,
        invoiceNumber: true, antiquePermitNumber: true, contractNotifyEmail: true, calendarInviteEmail: true,
        serviceAreas: true, operatorId: true,
        operator: { select: { id: true, name: true } },
        _count: { select: { customers: true } },
      },
    })
    await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name, action: `店舗情報を編集「${updated.name}」`, req: request })
    return NextResponse.json(updated)
  }

  return NextResponse.json({ error: '無効なリクエスト' }, { status: 400 })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (!['admin','superadmin','hr'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const store = await prisma.store.findUnique({
    where: { id },
    select: {
      id: true, code: true, name: true,
      email: true, phone: true, prefecture: true, postalCode: true, address: true,
      storeStatus: true, openingDate: true, closingDate: true,
      googleBusinessUrl: true, oikuraPageUrl: true, lineAddFriendUrl: true, bankInfo: true,
      bankName: true, branchName: true, accountType: true, accountNumber: true, accountHolder: true,
      invoiceNumber: true, antiquePermitNumber: true,
      serviceAreas: true,
      isActive: true,
      _count: { select: { customers: true } },
    },
  })
  if (!store) return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
  return NextResponse.json(store)
}
