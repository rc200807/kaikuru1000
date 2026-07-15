import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { ENTITY_TYPES, CORPORATE_PREFIXES, OPERATOR_SUPPORTED_SERVICE_KEYS } from '@/lib/operator-utils'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin','superadmin','hr'].includes(user?.role)) return null
  return user
}

const createSchema = z.object({
  entityType:             z.enum(ENTITY_TYPES),
  corporatePrefix:        z.enum(CORPORATE_PREFIXES).nullable().optional(),
  name:                   z.string().min(1).max(120),
  address:                z.string().max(200).nullable().optional(),
  representativeName:     z.string().min(1).max(100),
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

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const operators = await prisma.operator.findMany({
    include: {
      stores: { select: { id: true, name: true, code: true } },
      _count: { select: { stores: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(operators)
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  const { supportedServices, ...rest } = parsed.data
  const data: Record<string, unknown> = { ...rest, supportedServices: JSON.stringify(supportedServices ?? []) }
  if (data.email === '') data.email = null
  // 個人事業主時はプレフィックスを強制 null
  if (data.entityType === 'sole_proprietor') {
    data.corporatePrefix = null
  }

  const operator = await prisma.operator.create({ data: data as any })
  return NextResponse.json(operator, { status: 201 })
}
