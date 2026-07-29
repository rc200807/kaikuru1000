import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { getSystemFeeServices } from '@/lib/store-billing'
import { recordAccessLog } from '@/lib/access-log'
import { z } from 'zod'

// システム利用料の料金項目マスタ（対応サービスごとの月額）

export async function GET() {
  const admin = await requireSysAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await getSystemFeeServices())
}

const createSchema = z.object({
  serviceKey: z.string().trim().min(1).max(50).regex(/^[a-z0-9_-]+$/, 'キーは半角英数・ハイフン・アンダースコアのみ'),
  label: z.string().trim().min(1).max(50),
  monthlyAmount: z.number().int().min(0).max(10_000_000),
})

export async function POST(request: NextRequest) {
  const admin = await requireSysAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '入力内容を確認してください' }, { status: 400 })
  }
  const { serviceKey, label, monthlyAmount } = parsed.data

  const dup = await prisma.systemFeeService.findUnique({ where: { serviceKey } })
  if (dup) return NextResponse.json({ error: `キー「${serviceKey}」は既に登録されています` }, { status: 400 })

  const max = await prisma.systemFeeService.aggregate({ _max: { sortOrder: true } })
  const created = await prisma.systemFeeService.create({
    data: { serviceKey, label, monthlyAmount, sortOrder: (max._max.sortOrder ?? 0) + 1 },
  })

  await recordAccessLog({
    userType: 'sysadmin', userId: admin.id, userName: admin.name,
    action: `システム利用料の項目を追加（${label} [${serviceKey}] ¥${monthlyAmount.toLocaleString()}/月）`, req: request,
  })
  return NextResponse.json(created, { status: 201 })
}
