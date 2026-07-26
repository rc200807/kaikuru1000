import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { recordAccessLog } from '@/lib/access-log'
import { getRevenueShareSetting } from '@/lib/revenue-share'
import { z } from 'zod'

// アキクル請求の分配割合設定（システム管理者/本部/加盟店）

export async function GET() {
  const admin = await requireSysAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const setting = await getRevenueShareSetting()
  return NextResponse.json(setting)
}

const putSchema = z.object({
  systemPercent: z.number().int().min(0).max(100),
  hqPercent: z.number().int().min(0).max(100),
  storePercent: z.number().int().min(0).max(100),
  systemRecipientType: z.enum(['platform', 'connect']),
  systemStripeAccountId: z.string().trim().startsWith('acct_').nullable().optional(),
  hqRecipientType: z.enum(['platform', 'connect']),
  hqStripeAccountId: z.string().trim().startsWith('acct_').nullable().optional(),
}).refine(d => d.systemPercent + d.hqPercent + d.storePercent === 100, {
  message: '3者の割合の合計は100%にしてください',
}).refine(d => d.systemRecipientType !== 'connect' || !!d.systemStripeAccountId, {
  message: 'システム管理者の受取先ConnectアカウントID（acct_...）を入力してください',
}).refine(d => d.hqRecipientType !== 'connect' || !!d.hqStripeAccountId, {
  message: '本部の受取先ConnectアカウントID（acct_...）を入力してください',
})

export async function PUT(request: NextRequest) {
  const admin = await requireSysAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const parsed = putSchema.safeParse(body)
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? '入力内容が正しくありません'
    return NextResponse.json({ error: message }, { status: 400 })
  }
  const d = parsed.data

  await getRevenueShareSetting() // 無ければ作成
  const updated = await prisma.revenueShareSetting.update({
    where: { id: 'default' },
    data: {
      systemPercent: d.systemPercent,
      hqPercent: d.hqPercent,
      storePercent: d.storePercent,
      systemRecipientType: d.systemRecipientType,
      systemStripeAccountId: d.systemRecipientType === 'connect' ? d.systemStripeAccountId : null,
      hqRecipientType: d.hqRecipientType,
      hqStripeAccountId: d.hqRecipientType === 'connect' ? d.hqStripeAccountId : null,
      updatedByAdminId: admin.id,
    },
  })

  await recordAccessLog({ userType: 'sysadmin', userId: admin.id, userName: admin.name, action: `分配割合を更新（シ${d.systemPercent}/本${d.hqPercent}/店${d.storePercent}）`, req: request })
  return NextResponse.json(updated)
}
