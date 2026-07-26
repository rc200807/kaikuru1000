import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { resolveStoreScope } from '@/lib/store-scope'
import { storeSupportsAkikuru } from '@/lib/store-services'
import { AKIYA_PLANS } from '@/lib/akiya-plans'
import { isAkiyaStatus, AKIYA_STATUSES } from '@/lib/akiya-status'
import { z } from 'zod'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

const LIST_SELECT = {
  id: true, propertyAddress: true, startDate: true, endDate: true,
  plan: true, status: true, photoUrls: true,
  lastVisitedAt: true, nextVisitAt: true, createdAt: true,
  user: { select: { id: true, name: true, phone: true } },
  store: { select: { id: true, name: true, code: true } },
  _count: { select: { records: true } },
} as const

// 空き家管理案件の一覧（店舗=スコープ内、管理者=全件）
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isStore = sessionUser.role === 'store'
  const isAdmin = ADMIN_ROLES.includes(sessionUser.role)
  if (!isStore && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const sp = new URL(request.url).searchParams
  const where: any = {}

  if (isStore) {
    const scope = await resolveStoreScope(sessionUser.id, sp.get('storeIds'))
    where.storeId = scope.isMulti ? { in: scope.storeIds } : sessionUser.id
  } else if (sp.get('storeId')) {
    where.storeId = sp.get('storeId')
  }

  const status = sp.get('status')
  if (status && isAkiyaStatus(status)) where.status = status
  const q = (sp.get('q') ?? '').trim()
  if (q) {
    where.OR = [
      { propertyAddress: { contains: q } },
      { user: { name: { contains: q } } },
    ]
  }

  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)
  const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') ?? '50', 10) || 50))

  const [cases, total] = await Promise.all([
    prisma.akiyaCase.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.akiyaCase.count({ where }),
  ])

  return NextResponse.json({ cases, total, page, limit })
}

const createSchema = z.object({
  userId: z.string().min(1),
  storeId: z.string().optional(),          // adminのみ有効（storeはセッション店舗固定）
  propertyAddress: z.string().trim().min(1).max(500),
  startDate: z.string().optional().or(z.literal('')),
  endDate: z.string().optional().or(z.literal('')),
  plan: z.enum(AKIYA_PLANS).default('standard'),
  status: z.enum(AKIYA_STATUSES).default('pre_contract'),
  note: z.string().max(20000).optional(),
  nextVisitAt: z.string().optional().or(z.literal('')),
})

const toDate = (v: string | undefined) => {
  if (!v) return null
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

// 空き家管理案件の作成（店舗・管理者）
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const isStore = sessionUser.role === 'store'
  const isAdmin = ADMIN_ROLES.includes(sessionUser.role)
  if (!isStore && !isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: '入力内容が正しくありません' }, { status: 400 })
  const data = parsed.data

  // 対象顧客の存在と（店舗の場合は）所有権を確認
  const targetUser = await prisma.user.findUnique({
    where: { id: data.userId },
    select: { id: true, name: true, storeId: true },
  })
  if (!targetUser) return NextResponse.json({ error: '顧客が見つかりません' }, { status: 404 })

  let storeId: string
  if (isStore) {
    if (targetUser.storeId !== sessionUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    storeId = sessionUser.id
  } else {
    storeId = data.storeId || targetUser.storeId || ''
    if (!storeId) return NextResponse.json({ error: '担当店舗を指定してください' }, { status: 400 })
  }

  // 空き家管理はアキクル対応店舗のみ
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { supportedServices: true } })
  if (!store) return NextResponse.json({ error: '店舗が見つかりません' }, { status: 404 })
  if (!storeSupportsAkikuru(store.supportedServices)) {
    return NextResponse.json({ error: 'この店舗はアキクルに対応していません' }, { status: 400 })
  }

  const created = await prisma.akiyaCase.create({
    data: {
      userId: data.userId,
      storeId,
      propertyAddress: data.propertyAddress,
      startDate: toDate(data.startDate),
      endDate: toDate(data.endDate),
      plan: data.plan,
      status: data.status,
      note: data.note?.trim() || null,
      nextVisitAt: toDate(data.nextVisitAt),
      createdByType: sessionUser.role ?? null,
      createdById: sessionUser.id ?? null,
      createdByName: sessionUser.memberName ?? sessionUser.name ?? null,
      memberId: sessionUser.memberId ?? null,
    },
    select: LIST_SELECT,
  })

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, memberId: sessionUser.memberId ?? null, action: `空き家管理案件を作成「${targetUser.name}」`, req: request })
  return NextResponse.json(created, { status: 201 })
}
