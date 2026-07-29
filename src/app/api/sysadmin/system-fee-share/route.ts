import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { recordAccessLog } from '@/lib/access-log'
import { getSystemFeeShareSetting, SYSTEM_FEE_SETTING_ID } from '@/lib/revenue-share'
import { z } from 'zod'

// システム利用料の分配割合設定（システム管理者/本部の2者。加盟店は常に0%）

export async function GET() {
  const admin = await requireSysAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await getSystemFeeShareSetting())
}

const putSchema = z.object({
  systemPercent: z.number().int().min(0).max(100),
  hqPercent: z.number().int().min(0).max(100),
  systemRecipientType: z.enum(['platform', 'connect']),
  systemStripeAccountId: z.string().trim().startsWith('acct_').nullable().optional(),
  hqRecipientType: z.enum(['platform', 'connect']),
  hqStripeAccountId: z.string().trim().startsWith('acct_').nullable().optional(),
}).refine(d => d.systemPercent + d.hqPercent === 100, {
  message: 'システム管理者と本部の割合の合計は100%にしてください',
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
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? '入力内容が正しくありません' }, { status: 400 })
  }
  const d = parsed.data

  const setting = await prisma.revenueShareSetting.upsert({
    where: { id: SYSTEM_FEE_SETTING_ID },
    create: {
      id: SYSTEM_FEE_SETTING_ID,
      systemPercent: d.systemPercent, hqPercent: d.hqPercent, storePercent: 0,
      systemRecipientType: d.systemRecipientType,
      systemStripeAccountId: d.systemRecipientType === 'connect' ? d.systemStripeAccountId : null,
      hqRecipientType: d.hqRecipientType,
      hqStripeAccountId: d.hqRecipientType === 'connect' ? d.hqStripeAccountId : null,
      updatedByAdminId: admin.id,
    },
    update: {
      systemPercent: d.systemPercent, hqPercent: d.hqPercent, storePercent: 0,
      systemRecipientType: d.systemRecipientType,
      systemStripeAccountId: d.systemRecipientType === 'connect' ? d.systemStripeAccountId : null,
      hqRecipientType: d.hqRecipientType,
      hqStripeAccountId: d.hqRecipientType === 'connect' ? d.hqStripeAccountId : null,
      updatedByAdminId: admin.id,
    },
  })

  await recordAccessLog({
    userType: 'sysadmin', userId: admin.id, userName: admin.name,
    action: `システム利用料の分配設定を更新（システム${d.systemPercent}% / 本部${d.hqPercent}%）`, req: request,
  })
  return NextResponse.json(setting)
}
