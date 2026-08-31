import { NextRequest, NextResponse, after } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { recordAccessLog } from '@/lib/access-log'
import { autoSyncStoreRows, autoSyncStoreRowsDeleted } from '@/lib/sheet-sync'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { sendStorePasswordResetNotification } from '@/lib/mailer'
import { operatorInheritedValues } from '@/lib/operator-store-sync'
import { parseStoreServices, stringifyStoreServices } from '@/lib/store-services'

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
      // 店舗専用ログインURLを案内する（この店舗のアカウントだけを照合する画面）
      const loginUrl = `${process.env.NEXTAUTH_URL ?? ''}/store/login/${encodeURIComponent(store.code)}`
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
      'warehouseAddress', 'warehousePostalCode',
      'storeStatus', 'openingDate', 'closingDate',
      'googleBusinessUrl', 'oikuraPageUrl', 'lineAddFriendUrl', 'bankInfo',
      'bankName', 'branchName', 'accountType', 'accountNumber', 'accountHolder',
      'invoiceNumber', 'antiquePermitNumber', 'contractNotifyEmail', 'calendarInviteEmail',
      'serviceAreas', 'supportedServices',
    ] as const
    const data: Record<string, any> = {}
    for (const field of allowedFields) {
      if (field in body) {
        if (field === 'openingDate' || field === 'closingDate') {
          data[field] = body[field] ? new Date(body[field]) : null
        } else if (field === 'supportedServices') {
          // JSON配列文字列 or 配列を受け取り、有効キーのみに正規化して保存
          const raw = typeof body[field] === 'string' ? parseStoreServices(body[field]) : body[field]
          data[field] = stringifyStoreServices(raw)
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
        warehousePostalCode: true, warehouseAddress: true,
        storeStatus: true, openingDate: true, closingDate: true,
        googleBusinessUrl: true, oikuraPageUrl: true, lineAddFriendUrl: true, bankInfo: true,
        bankName: true, branchName: true, accountType: true, accountNumber: true, accountHolder: true,
        invoiceNumber: true, antiquePermitNumber: true, contractNotifyEmail: true, calendarInviteEmail: true,
        serviceAreas: true, supportedServices: true, operatorId: true,
        operator: { select: { id: true, name: true } },
        _count: { select: { customers: true } },
      },
    })
    await recordAccessLog({ userType: user.role, userId: user.id, userName: user.name, action: `店舗情報を編集「${updated.name}」`, req: request })
    after(() => autoSyncStoreRows([updated.code]))
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
      warehousePostalCode: true, warehouseAddress: true,
      storeStatus: true, openingDate: true, closingDate: true,
      googleBusinessUrl: true, oikuraPageUrl: true, lineAddFriendUrl: true, bankInfo: true,
      bankName: true, branchName: true, accountType: true, accountNumber: true, accountHolder: true,
      invoiceNumber: true, antiquePermitNumber: true,
      serviceAreas: true, supportedServices: true,
      isActive: true,
      _count: { select: { customers: true } },
    },
  })
  if (!store) return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
  return NextResponse.json(store)
}

/**
 * 店舗の削除。
 *
 * 顧客・案件・決済などの業務データが1件でも紐づいている店舗は削除できない
 * （DBの外部キーが Restrict のため実行しても失敗するうえ、消してしまうと
 *  会計・契約の履歴が失われる）。その場合は何が残っているかを返して中止し、
 *  営業ステータス「閉店」に切り替える運用を案内する。
 *
 * 削除できるのは実質的に未使用の店舗のみ。店舗メンバー・チャットルーム・
 * 在庫・カレンダー連携などの付随データは店舗と一緒に削除される。
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (!['admin', 'superadmin', 'hr'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const store = await prisma.store.findUnique({
    where: { id },
    select: {
      id: true, code: true, name: true,
      _count: {
        select: {
          customers: true, visitSchedules: true, visitRequests: true,
          deals: true, inquiries: true, storePayments: true,
          complaints: true, bugReports: true, akiyaCases: true,
          communityThreads: true, communityReplies: true, communityReactions: true,
          members: true,
        },
      },
    },
  })
  if (!store) return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })

  const c = store._count
  // 消すと履歴が失われる業務データ（DB側も Restrict で守られている）
  const blockers = [
    { label: '顧客', count: c.customers },
    { label: '訪問予定', count: c.visitSchedules },
    { label: '訪問依頼', count: c.visitRequests },
    { label: '案件', count: c.deals },
    { label: 'お問い合わせ', count: c.inquiries },
    { label: '決済記録', count: c.storePayments },
    { label: 'クレーム', count: c.complaints },
    { label: '不具合報告', count: c.bugReports },
    { label: '空き家案件', count: c.akiyaCases },
    { label: '知恵袋の投稿', count: c.communityThreads },
    { label: '知恵袋の返信', count: c.communityReplies },
    { label: '知恵袋のリアクション', count: c.communityReactions },
  ].filter(b => b.count > 0)

  if (blockers.length > 0) {
    return NextResponse.json({
      error: 'この店舗には業務データが紐づいているため削除できません',
      blockers,
      hint: '履歴を残す必要があるため削除はできません。営業ステータスを「閉店」に変更してください。顧客は一括操作で別の店舗へ割り当て直せます。',
    }, { status: 409 })
  }

  // 店舗メンバーは店舗が無くなると意味を持たないため一緒に削除する
  await prisma.$transaction([
    prisma.storeMember.deleteMany({ where: { storeId: id } }),
    prisma.store.delete({ where: { id } }),
  ])

  await recordAccessLog({
    userType: user.role, userId: user.id, userName: user.name,
    action: `店舗を削除「${store.name}」（${store.code}）`, req: request,
  })

  after(() => autoSyncStoreRowsDeleted([store.code]))

  return NextResponse.json({ deleted: true, memberCount: c.members })
}
