import { NextRequest, NextResponse, after } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { deleteFile } from '@/lib/storage'
import { ENTITY_TYPES, CORPORATE_PREFIXES, OPERATOR_SUPPORTED_SERVICE_KEYS, parseSupportedServices } from '@/lib/operator-utils'
import { syncStoresForOperator } from '@/lib/operator-store-sync'
import { autoSyncOperatorRows, autoSyncOperatorRowsDeleted, autoSyncStoreRows } from '@/lib/sheet-sync'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(user?.role)) return null
  return user
}

const updateSchema = z.object({
  entityType:             z.enum(ENTITY_TYPES).optional(),
  corporatePrefix:        z.enum(CORPORATE_PREFIXES).nullable().optional(),
  name:                   z.string().min(1).max(120).optional(),
  address:                z.string().max(200).nullable().optional(),
  representativeName:     z.string().min(1).max(100).optional(),
  representativeNameKana: z.string().max(120).nullable().optional(),
  corporateNumber:        z.string().max(20).nullable().optional(),
  invoiceRegistered:      z.boolean().optional(),
  invoiceNumber:          z.string().max(20).nullable().optional(),
  phone:                  z.string().max(20).nullable().optional(),
  email:                  z.string().email().nullable().optional().or(z.literal('')),
  antiquePermitNumber:    z.string().max(50).nullable().optional(),
  antiqueOfficeAddress:   z.string().max(200).nullable().optional(),
  antiqueLicenseHolder:   z.string().max(100).nullable().optional(),
  publicSafetyCommission: z.string().max(100).nullable().optional(),
  service:                z.string().max(2000).nullable().optional(),
  supportedServices:      z.array(z.enum(OPERATOR_SUPPORTED_SERVICE_KEYS)).optional(),
  bankName:               z.string().max(100).nullable().optional(),
  branchName:             z.string().max(100).nullable().optional(),
  accountType:            z.string().max(20).nullable().optional(),
  accountNumber:          z.string().max(20).nullable().optional(),
  accountHolder:          z.string().max(100).nullable().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const operator = await prisma.operator.findUnique({
    where: { id },
    include: {
      stores: { select: { id: true, name: true, code: true } },
    },
  })
  if (!operator) return NextResponse.json({ error: 'Not Found' }, { status: 404 })
  // 契約書 path はクライアントに直接返さず、配信URL形式に置換。supportedServices はJSON文字列→配列に変換
  return NextResponse.json({
    ...operator,
    contractFilePath: operator.contractFilePath ? `/api/admin/operators/${id}/contract` : null,
    supportedServices: parseSupportedServices(operator.supportedServices),
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  const { supportedServices, ...rest } = parsed.data
  const data = { ...rest } as Record<string, unknown>
  if (supportedServices !== undefined) data.supportedServices = JSON.stringify(supportedServices)
  if (data.email === '') data.email = null
  if (data.entityType === 'sole_proprietor') {
    data.corporatePrefix = null
  }

  const updated = await prisma.operator.update({ where: { id }, data })
  // 継承項目（銀行口座/古物許可番号/インボイス番号）を紐づく全店舗へ反映
  await syncStoresForOperator(prisma, id)

  after(async () => {
    await autoSyncOperatorRows([id])
    // 継承項目が変わるため、紐づく店舗の行もあわせて更新する
    const stores = await prisma.store.findMany({ where: { operatorId: id }, select: { code: true } })
    await autoSyncStoreRows(stores.map(s => s.code))
  })

  return NextResponse.json({ ...updated, supportedServices: parseSupportedServices(updated.supportedServices) })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const operator = await prisma.operator.findUnique({ where: { id }, select: { contractFilePath: true } })
  if (!operator) return NextResponse.json({ error: 'Not Found' }, { status: 404 })

  // 契約書ファイルがあれば削除
  if (operator.contractFilePath) {
    try { await deleteFile(operator.contractFilePath) } catch { /* ignore */ }
  }

  // 削除で operatorId が SetNull される店舗は「運営者名」列が変わるため、削除前に控える
  const affectedStores = await prisma.store.findMany({ where: { operatorId: id }, select: { code: true } })

  await prisma.operator.delete({ where: { id } })

  after(async () => {
    await autoSyncOperatorRowsDeleted([id])
    await autoSyncStoreRows(affectedStores.map(s => s.code))
  })

  return NextResponse.json({ ok: true })
}
