import { NextRequest, NextResponse, after } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { z } from 'zod'
import { operatorInheritedValues } from '@/lib/operator-store-sync'
import { parseStoreServices, stringifyStoreServices } from '@/lib/store-services'
import { autoSyncStoreRows } from '@/lib/sheet-sync'

function generatePassword(): string {
  // 読みやすい文字のみ（0/O/l/I 等を除く）
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const bytes = randomBytes(12)
  return Array.from(bytes).map(b => chars[b % chars.length]).join('')
}

// 店舗コードを自動生成（0206160b のような8桁の16進文字列）。重複時はリトライ。
async function generateUniqueStoreCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = randomBytes(4).toString('hex')
    const exists = await prisma.store.findFirst({ where: { code }, select: { id: true } })
    if (!exists) return code
  }
  // 万一の連続衝突時は桁数を増やす
  return randomBytes(6).toString('hex')
}

const createSchema = z.object({
  code:       z.string().min(1).max(50).optional(), // 未指定なら自動生成
  name:       z.string().min(1).max(100),
  email:      z.string().email().optional().or(z.literal('')),
  phone:      z.string().max(20).optional(),
  prefecture: z.string().max(10).optional(),
  postalCode: z.string().max(10).optional(),
  address:    z.string().max(200).optional(),
  warehousePostalCode: z.string().max(10).optional(),
  warehouseAddress:    z.string().max(200).optional(),
  // 一括編集グリッドの「行追加」で全カラムを保存できるよう、詳細フィールドも受け付ける
  storeStatus:         z.string().optional(),
  openingDate:         z.string().optional().or(z.literal('')),
  closingDate:         z.string().optional().or(z.literal('')),
  googleBusinessUrl:   z.string().optional(),
  oikuraPageUrl:       z.string().optional(),
  lineAddFriendUrl:    z.string().optional(),
  bankName:            z.string().optional(),
  branchName:          z.string().optional(),
  accountType:         z.string().optional(),
  accountNumber:       z.string().optional(),
  accountHolder:       z.string().optional(),
  invoiceNumber:       z.string().optional(),
  antiquePermitNumber: z.string().optional(),
  contractNotifyEmail: z.string().optional(),
  calendarInviteEmail: z.string().optional(),
  supportedServices:   z.string().optional(), // JSON配列文字列（例: '["kaikuru","akikuru"]'）
  operatorId:          z.string().optional().or(z.literal('')),
})

// フルの店舗オブジェクトを返すための select（一括編集グリッドの BulkStore 形に一致）
const STORE_DETAIL_SELECT = {
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
} as const

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (!['admin','superadmin','hr'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '入力内容が正しくありません' }, { status: 400 })
  }

  const {
    name, email, phone, prefecture, postalCode, address,
    warehousePostalCode, warehouseAddress,
    storeStatus, openingDate, closingDate,
    googleBusinessUrl, oikuraPageUrl, lineAddFriendUrl,
    bankName, branchName, accountType, accountNumber, accountHolder,
    invoiceNumber, antiquePermitNumber, contractNotifyEmail, calendarInviteEmail,
    supportedServices,
    operatorId,
  } = parsed.data

  // 運営者の割り当て。指定時は継承項目（銀行口座/古物許可番号/インボイス番号）を運営者の値で埋める
  const opId = operatorId?.trim() || null
  let inherited: Record<string, string | null> | null = null
  if (opId) {
    const op = await prisma.operator.findUnique({
      where: { id: opId },
      select: {
        bankName: true, branchName: true, accountType: true, accountNumber: true, accountHolder: true,
        antiquePermitNumber: true, invoiceNumber: true,
      },
    })
    if (!op) {
      return NextResponse.json({ error: '指定された運営者が見つかりません' }, { status: 400 })
    }
    inherited = operatorInheritedValues(op)
  }

  // 店舗コード：手入力があればそれを使用（重複チェック）、無ければ自動生成
  let code = parsed.data.code?.trim()
  if (code) {
    const existing = await prisma.store.findFirst({ where: { code } })
    if (existing) {
      return NextResponse.json({ error: '店舗コードが既に使用されています' }, { status: 400 })
    }
  } else {
    code = await generateUniqueStoreCode()
  }

  const plainPassword = generatePassword()
  const hashedPassword = await bcrypt.hash(plainPassword, 10)

  const store = await prisma.store.create({
    data: {
      code,
      name,
      email:      email      || null,
      phone:      phone      || null,
      prefecture: prefecture || null,
      postalCode: postalCode || null,
      address:    address    || null,
      warehousePostalCode: warehousePostalCode || null,
      warehouseAddress:    warehouseAddress    || null,
      password:   hashedPassword,
      storeStatus:         storeStatus         || null,
      openingDate:         openingDate  ? new Date(openingDate)  : null,
      closingDate:         closingDate  ? new Date(closingDate)  : null,
      googleBusinessUrl:   googleBusinessUrl   || null,
      oikuraPageUrl:       oikuraPageUrl       || null,
      lineAddFriendUrl:    lineAddFriendUrl    || null,
      bankName:            bankName            || null,
      branchName:          branchName          || null,
      accountType:         accountType         || null,
      accountNumber:       accountNumber       || null,
      accountHolder:       accountHolder       || null,
      invoiceNumber:       invoiceNumber       || null,
      antiquePermitNumber: antiquePermitNumber || null,
      contractNotifyEmail: contractNotifyEmail || null,
      calendarInviteEmail: calendarInviteEmail || null,
      supportedServices:   stringifyStoreServices(parseStoreServices(supportedServices)),
      operatorId:          opId,
      // 運営者が割り当てられている場合は継承項目を運営者の値で上書き（運営者が「正」）
      ...(inherited ?? {}),
    },
    select: STORE_DETAIL_SELECT,
  })

  after(() => autoSyncStoreRows([store.code]))

  return NextResponse.json({ store, password: plainPassword }, { status: 201 })
}
