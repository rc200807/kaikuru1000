// アキクル請求の分配割合設定（シングルトン id="default"）の読み書きヘルパー
import { prisma } from '@/lib/prisma'

const SETTING_ID = 'default'

export type RevenueShareRecipientType = 'platform' | 'connect'

/** 分配設定を取得（無ければ既定値で作成） */
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
 * 分配額の計算。各取り分は floor（円・整数）、端数はプラットフォームが保持する
 * （どの受取先がプラットフォーム自身かに関わらず、Transferしない残余として自然に残る）。
 */
export function computeShares(amount: number, percents: { system: number; hq: number; store: number }) {
  const system = Math.floor((amount * percents.system) / 100)
  const hq = Math.floor((amount * percents.hq) / 100)
  const store = Math.floor((amount * percents.store) / 100)
  return { system, hq, store, remainder: amount - system - hq - store }
}
