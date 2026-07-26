/**
 * 空き家管理案件のプラン中央定義。
 * 注意: 'use client' を付けないこと（サーバー・クライアント共用）
 */
export const AKIYA_PLANS = ['standard', 'light', 'premium', 'mansion'] as const
export type AkiyaPlan = typeof AKIYA_PLANS[number]

export const AKIYA_PLAN_LABEL: Record<string, string> = {
  standard: 'スタンダード',
  light:    'ライト',
  premium:  'プレミアム',
  mansion:  'マンション',
}

export const AKIYA_PLAN_BADGE: Record<string, { bg: string; fg: string }> = {
  standard: { bg: 'rgba(59,130,246,0.15)',  fg: '#3b82f6' },
  light:    { bg: 'rgba(34,197,94,0.15)',   fg: '#16a34a' },
  premium:  { bg: 'rgba(168,85,247,0.15)',  fg: '#9333ea' },
  mansion:  { bg: 'rgba(251,191,36,0.15)',  fg: '#b45309' },
}

export const AKIYA_PLAN_OPTIONS = AKIYA_PLANS.map(value => ({
  value, label: AKIYA_PLAN_LABEL[value],
}))

export function isAkiyaPlan(v: unknown): v is AkiyaPlan {
  return typeof v === 'string' && (AKIYA_PLANS as readonly string[]).includes(v)
}

export function akiyaPlanLabel(value: string | null | undefined): string {
  return (value && AKIYA_PLAN_LABEL[value]) || AKIYA_PLAN_LABEL.standard
}
