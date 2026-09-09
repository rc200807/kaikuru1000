/**
 * 訪問リクエスト・定期宅配の「利用間隔」の中央定義。
 *
 * 顧客ごとの間隔は User.visitFrequencyMonths（何ヶ月に1回）が正。
 * 未設定の顧客・新規登録時の既定値は SiteConfig の
 *   visitRequestIntervalMonths（訪問リクエスト。既定 1ヶ月）
 *   deliveryShipmentIntervalMonths（定期宅配の送付。既定 3ヶ月）
 * を使う。0 を設定すると無制限（回数制限なし）になる。
 *
 * 注意: 'use client' を付けないこと（サーバー・クライアント共用の純ロジック＋サーバーヘルパー）
 */
import { prisma } from '@/lib/prisma'
import { formatJstDate } from '@/lib/datetime'

/** 顧客タイプごとの既定間隔（SiteConfig 未作成時のフォールバック） */
export const DEFAULT_VISIT_REQUEST_INTERVAL_MONTHS = 1
export const DEFAULT_DELIVERY_INTERVAL_MONTHS = 3

export type IntervalKind = 'visit-request' | 'delivery'

export type IntervalDefaults = {
  visitRequestIntervalMonths: number
  deliveryShipmentIntervalMonths: number
}

/** 管理ポータルで設定された既定間隔を読む（未作成なら定数の既定値） */
export async function fetchIntervalDefaults(): Promise<IntervalDefaults> {
  const config = await prisma.siteConfig.findFirst({
    select: { visitRequestIntervalMonths: true, deliveryShipmentIntervalMonths: true },
  })
  return {
    visitRequestIntervalMonths: config?.visitRequestIntervalMonths ?? DEFAULT_VISIT_REQUEST_INTERVAL_MONTHS,
    deliveryShipmentIntervalMonths: config?.deliveryShipmentIntervalMonths ?? DEFAULT_DELIVERY_INTERVAL_MONTHS,
  }
}

/** 顧客タイプに応じた新規登録時の既定間隔（定期宅配は3ヶ月に1回） */
export function defaultIntervalForCustomerType(
  customerType: string | null | undefined,
  defaults: IntervalDefaults,
): number {
  return customerType === 'delivery'
    ? defaults.deliveryShipmentIntervalMonths
    : defaults.visitRequestIntervalMonths
}

/**
 * この顧客に適用する間隔（月数）。
 * 顧客ごとの値が入っていればそれを使い、無ければ種別ごとの既定値。
 */
export function resolveIntervalMonths(
  kind: IntervalKind,
  user: { visitFrequencyMonths?: number | null },
  defaults: IntervalDefaults,
): number {
  const own = user.visitFrequencyMonths
  if (typeof own === 'number' && own > 0) return own
  if (own === 0) return 0 // 明示的な無制限
  return kind === 'delivery' ? defaults.deliveryShipmentIntervalMonths : defaults.visitRequestIntervalMonths
}

/**
 * 直前の利用日時 + 間隔 = 次に利用できる日時（間隔0なら null＝いつでも可）。
 * 月末の繰り上がり（1/31 + 1ヶ月 = 3/3）は利用者に説明しづらいため、
 * 対象月の末日にクランプする（1/31 + 1ヶ月 = 2/28）。
 */
export function nextAvailableAt(lastUsedAt: Date | null | undefined, intervalMonths: number): Date | null {
  if (!lastUsedAt || intervalMonths <= 0) return null
  const next = new Date(lastUsedAt)
  const day = next.getDate()
  next.setDate(1)
  next.setMonth(next.getMonth() + intervalMonths)
  const lastDayOfMonth = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  next.setDate(Math.min(day, lastDayOfMonth))
  return next
}

export type IntervalAvailability = {
  /** 今すぐ利用できるか */
  available: boolean
  /** 適用中の間隔（月数）。0 は無制限 */
  intervalMonths: number
  /** 直前の利用日時（ISO文字列。未利用は null） */
  lastUsedAt: string | null
  /** 次に利用できる日時（ISO文字列。制限なし・待ち不要は null） */
  nextAvailableAt: string | null
}

/** 「あと○日」の案内文（画面・メールで共用） */
export function intervalNoticeText(a: IntervalAvailability): string {
  if (a.intervalMonths <= 0) return 'いつでもリクエストいただけます'
  if (a.available) return 'いまリクエストいただけます'
  if (!a.nextAvailableAt) return 'いまリクエストいただけます'
  return `${formatJstDate(a.nextAvailableAt)}以降にリクエストいただけます（${a.intervalMonths}ヶ月に1回までのご利用となります）`
}

/** 直前の利用日時から利用可否を組み立てる */
export function buildAvailability(lastUsedAt: Date | null, intervalMonths: number, now: Date = new Date()): IntervalAvailability {
  const next = nextAvailableAt(lastUsedAt, intervalMonths)
  return {
    available: !next || next.getTime() <= now.getTime(),
    intervalMonths,
    lastUsedAt: lastUsedAt ? lastUsedAt.toISOString() : null,
    nextAvailableAt: next && next.getTime() > now.getTime() ? next.toISOString() : null,
  }
}

/**
 * 訪問リクエストの利用可否。
 * 「顧客が出したリクエスト」のうち辞退・キャンセル以外を1回の利用として数える
 * （店舗からの提案は顧客の利用回数に含めない）。
 */
export async function visitRequestAvailability(userId: string): Promise<IntervalAvailability> {
  const [user, defaults, last] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { visitFrequencyMonths: true } }),
    fetchIntervalDefaults(),
    prisma.visitRequest.findFirst({
      where: {
        userId,
        requestedBy: 'customer',
        status: { notIn: ['cancelled', 'customer_declined'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ])
  const intervalMonths = resolveIntervalMonths('visit-request', user ?? {}, defaults)
  return buildAvailability(last?.createdAt ?? null, intervalMonths)
}

/**
 * 定期宅配（送付登録）の利用可否。
 * 下書きは利用回数に数えない（登録完了＝registered 以降を1回とする）。
 */
export async function deliveryShipmentAvailability(userId: string): Promise<IntervalAvailability> {
  const [user, defaults, last] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { visitFrequencyMonths: true } }),
    fetchIntervalDefaults(),
    prisma.deliveryShipment.findFirst({
      where: { userId, status: { not: 'draft' } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ])
  const intervalMonths = resolveIntervalMonths('delivery', user ?? {}, defaults)
  return buildAvailability(last?.createdAt ?? null, intervalMonths)
}
