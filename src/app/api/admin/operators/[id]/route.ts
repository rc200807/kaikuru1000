import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { deleteFile } from '@/lib/storage'
import { ENTITY_TYPES, PREFIX_POSITIONS, CORPORATE_PREFIXES } from '@/lib/operator-utils'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(user?.role)) return null
  return user
}

const updateSchema = z.object({
  entityType:             z.enum(ENTITY_TYPES).optional(),
  corporatePrefix:        z.enum(CORPORATE_PREFIXES).nullable().optional(),
  prefixPosition:         z.enum(PREFIX_POSITIONS).nullable().optional(),
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
  // 契約書 path はクライアントに直接返さず、配信URL形式に置換
  return NextResponse.json({
    ...operator,
    contractFilePath: operator.contractFilePath ? `/api/admin/operators/${id}/contract` : null,
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

  const data = { ...parsed.data } as Record<string, unknown>
  if (data.email === '') data.email = null
  if (data.entityType === 'sole_proprietor') {
    data.corporatePrefix = null
    data.prefixPosition = null
  }

  const updated = await prisma.operator.update({ where: { id }, data })
  return NextResponse.json(updated)
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

  await prisma.operator.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
