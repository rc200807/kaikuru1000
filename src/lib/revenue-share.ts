// 分配割合設定の読み書きヘルパー。
// - id="default": アキクル請求の3者分配（システム管理者/本部/加盟店）
// - id="system_fee": システム利用料の2者分配（システム管理者/本部。加盟店は常に0%）
import { prisma } from '@/lib/prisma'

const SETTING_ID = 'default'
export const SYSTEM_FEE_SETTING_ID = 'system_fee'

export type RevenueShareRecipientType = 'platform' | 'connect'

/** アキクル請求の分配設定を取得（無ければ既定値で作成） */
export async function getRevenueShareSetting() {
  const existing = await prisma.revenueShareSetting.findUnique({ where: { id: SETTING_ID } })
  if (existing) return existing
  return prisma.revenueShareSetting.upsert({
    where: { id: SETTING_ID },
    create: { id: SETTING_ID },
    update: {},
  })
}

/**
 * システム利用料の分配設定を取得（無ければ既定値で作成）。
 * 既定はシステム管理者100%・platform受取＝全額プラットフォーム（RC inc.）保持で送金なし。
 */
export async function getSystemFeeShareSetting() {
  const existing = await prisma.revenueShareSetting.findUnique({ where: { id: SYSTEM_FEE_SETTING_ID } })
  if (existing) return existing
  return prisma.revenueShareSetting.upsert({
    where: { id: SYSTEM_FEE_SETTING_ID },
    create: { id: SYSTEM_FEE_SETTING_ID, systemPercent: 100, hqPercent: 0, storePercent: 0 },
    update: {},
  })
}

/**
 * 分配額の計算。各取り分は floor（円・整数）、端数はプラットフォームが保持する
 * （どの受取先がプラットフォーム自身かに関わらず、Transferしない残余として自然に残る）。
 */
export function computeShares(amount: number, percents: { system: number; hq: number; store: number }) {
  const system = Math.floor((amount * percents.system) / 100)
  const hq = Math.floor((amount * percents.hq) / 100)
  const store = Math.floor((amount * percents.store) / 100)
  return { system, hq, store, remainder: amount - system - hq - store }
}
