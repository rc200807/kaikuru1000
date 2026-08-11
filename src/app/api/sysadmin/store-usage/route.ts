import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { jstMonthKey } from '@/lib/datetime'
import { getSystemFeeServices, computeStoreFee } from '@/lib/store-billing'
import { STORE_STATUSES, normalizeStoreStatus, storeStatusLabel } from '@/lib/store-status'
import { STORE_SERVICE_LABEL } from '@/lib/store-services'

/**
 * 店舗利用状況の集計（sysadmin「店舗利用状況」ページ）。
 * - 店舗数（有効アカウント / 営業ステータス別 / アクティブ）
 * - 対応サービス別（買いクル・アキクル…）の対応店舗数とうちアクティブ数
 * - システム利用料の月次集計（当月＝確定値、過去12ヶ月＝開業日/閉店日からの推計）
 *
 * 金額は Stripe の請求実績ではなく「料金項目マスタ × 店舗の対応サービス（＋店舗別上書き）」
 * から算出した想定額。請求は行わない。
 */

/** 集計対象＝アクティブとみなす営業ステータス（営業中のみ） */
const ACTIVE_STATUS = 'active'

/** 「最近ログインあり」とみなす日数 */
const RECENT_LOGIN_DAYS = 30

/** 直近 n ヶ月の月キー（JST・古い順） */
function recentMonthKeys(n: number, from: string): string[] {
  const [y, m] = from.split('-').map(Number)
  const keys: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1))
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  return keys
}

/** 月キー → JST の月初/翌月初（UTC の Date。JST 00:00 は UTC の 9 時間前） */
function jstMonthRange(monthKey: string): { start: Date; end: Date } {
  const [y, m] = monthKey.split('-').map(Number)
  return {
    start: new Date(Date.UTC(y, m - 1, 1) - 9 * 3600_000),
    end: new Date(Date.UTC(y, m, 1) - 9 * 3600_000),
  }
}

/** Store.supportedServices の生JSON → キー配列（マスタ未登録の独自キーも保持） */
function rawServiceKeys(json: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(json || '[]')
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.filter((k): k is string => typeof k === 'string' && k.length > 0))]
  } catch {
    return []
  }
}

export async function GET() {
  const admin = await requireSysAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const month = jstMonthKey(new Date())
  const [stores, settings, services] = await Promise.all([
    prisma.store.findMany({
      where: { isActive: true },
      select: {
        id: true, name: true, code: true, prefecture: true, storeStatus: true,
        supportedServices: true, openingDate: true, closingDate: true, createdAt: true,
      },
      orderBy: { code: 'asc' },
    }),
    prisma.systemFeeSetting.findMany({ select: { storeId: true, monthlyAmount: true, note: true, isActive: true } }),
    getSystemFeeServices(),
  ])
  const disabledAccounts = await prisma.store.count({ where: { isActive: false } })

  // ログイン実績（店舗管理ページの「ログイン状態」と同じ判定＝AccessLog に store の login がある）
  const storeIds = stores.map(s => s.id)
  const loginLogs = storeIds.length
    ? await prisma.accessLog.groupBy({
        by: ['userId'],
        where: { userType: 'store', action: 'login', userId: { in: storeIds } },
        _max: { createdAt: true },
      })
    : []
  const lastLoginByStore = new Map(loginLogs.map(l => [l.userId as string, l._max.createdAt]))
  const recentThreshold = new Date(Date.now() - RECENT_LOGIN_DAYS * 24 * 3600_000)

  const settingByStore = new Map(settings.map(s => [s.storeId, s]))

  // ─── 店舗ごとの行データ（料金・ステータス・対応サービス） ───
  const rows = stores.map(s => {
    const setting = settingByStore.get(s.id)
    const overrideAmount = setting?.monthlyAmount ?? 0
    const auto = computeStoreFee(s.supportedServices, services)
    const status = normalizeStoreStatus(s.storeStatus)
    const lastLoginAt = lastLoginByStore.get(s.id) ?? null
    return {
      id: s.id,
      hasLoggedIn: !!lastLoginAt,
      lastLoginAt,
      recentlyLoggedIn: !!lastLoginAt && lastLoginAt >= recentThreshold,
      name: s.name,
      code: s.code,
      prefecture: s.prefecture,
      status,
      statusLabel: storeStatusLabel(status),
      isActiveStore: status === ACTIVE_STATUS,
      serviceKeys: rawServiceKeys(s.supportedServices),
      services: auto.breakdown,
      autoAmount: auto.total,
      overrideAmount,
      effectiveAmount: overrideAmount > 0 ? overrideAmount : auto.total,
      note: setting?.note ?? '',
      // Stripe 自動課金の対象フラグ（売上・コスト＞システム利用料タブの設定）。
      // このページからは変更しないが、上書き額の保存時に現状値をそのまま送り返すために返す。
      billingActive: setting?.isActive ?? false,
      openingDate: s.openingDate,
      closingDate: s.closingDate,
      createdAt: s.createdAt,
    }
  })

  const activeRows = rows.filter(r => r.isActiveStore)

  // ─── 営業ステータス別（ログイン済み内訳つき） ───
  const byStatus = STORE_STATUSES.map(s => {
    const inStatus = rows.filter(r => r.status === s.value)
    return {
      value: s.value,
      label: s.label,
      count: inStatus.length,
      loggedIn: inStatus.filter(r => r.hasLoggedIn).length,
    }
  })

  // ─── ログイン状態別（店舗管理ページの「ログイン状態」と同じ判定） ───
  const login = {
    recentDays: RECENT_LOGIN_DAYS,
    loggedIn: rows.filter(r => r.hasLoggedIn).length,
    never: rows.filter(r => !r.hasLoggedIn).length,
    recent: rows.filter(r => r.recentlyLoggedIn).length,
    // アクティブ（営業中）店舗に絞った内訳
    activeTotal: activeRows.length,
    activeLoggedIn: activeRows.filter(r => r.hasLoggedIn).length,
    activeNever: activeRows.filter(r => !r.hasLoggedIn).length,
    activeRecent: activeRows.filter(r => r.recentlyLoggedIn).length,
  }

  // ─── 対応サービス別（マスタ＋店舗が持つ独自キーの和集合） ───
  const serviceKeysInUse = new Set<string>(rows.flatMap(r => r.serviceKeys))
  const masterByKey = new Map(services.map(s => [s.serviceKey, s]))
  const orderedKeys = [
    ...services.map(s => s.serviceKey),
    ...[...serviceKeysInUse].filter(k => !masterByKey.has(k)).sort(),
  ]
  const serviceRows = orderedKeys.map(key => {
    const master = masterByKey.get(key)
    const supported = rows.filter(r => r.serviceKeys.includes(key))
    const active = supported.filter(r => r.isActiveStore)
    const billable = master?.isActive ? (master.monthlyAmount ?? 0) : 0
    return {
      serviceKey: key,
      label: master?.label ?? STORE_SERVICE_LABEL[key as keyof typeof STORE_SERVICE_LABEL] ?? key,
      monthlyAmount: master?.monthlyAmount ?? 0,
      isActive: master?.isActive ?? false,
      inMaster: !!master,
      stores: supported.length,
      activeStores: active.length,
      loggedInStores: supported.filter(r => r.hasLoggedIn).length,
      activeLoggedInStores: active.filter(r => r.hasLoggedIn).length,
      // 当月の想定売上（アクティブ店舗のみ・上書き設定の店舗は自動算出から外れるため除く）
      monthlyRevenue: active.filter(r => r.overrideAmount === 0).length * billable,
    }
  })

  // ─── 対応サービスの組み合わせ別 ───
  const comboMap = new Map<string, { label: string; count: number; activeCount: number; loggedInCount: number }>()
  for (const r of rows) {
    const keys = orderedKeys.filter(k => r.serviceKeys.includes(k))
    const key = keys.join('+') || '__none__'
    const label = keys.length === 0
      ? '未設定'
      : keys.map(k => serviceRows.find(s => s.serviceKey === k)?.label ?? k).join(' ＋ ')
    const cur = comboMap.get(key) ?? { label, count: 0, activeCount: 0, loggedInCount: 0 }
    cur.count++
    if (r.isActiveStore) cur.activeCount++
    if (r.hasLoggedIn) cur.loggedInCount++
    comboMap.set(key, cur)
  }
  const combos = [...comboMap.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.count - a.count)

  // ─── システム利用料の当月集計（アクティブ店舗のみ） ───
  const billableRows = activeRows.filter(r => r.effectiveAmount > 0)
  const monthlyTotal = billableRows.reduce((sum, r) => sum + r.effectiveAmount, 0)

  // ─── 過去12ヶ月の推計 ───
  // 各月に「営業していた」店舗を開業日/閉店日から判定する。
  // 閉店日が未設定の店舗は現在の営業ステータスで代用するため、過去の月は推計値。
  const months = recentMonthKeys(12, month)
  const byMonth = months.map(mk => {
    const { start, end } = jstMonthRange(mk)
    const target = rows.filter(r => {
      if (r.effectiveAmount <= 0) return false
      const opened = r.openingDate ?? r.createdAt
      if (opened >= end) return false                      // その月にはまだ開業していない
      if (r.closingDate) return r.closingDate >= start     // 閉店月までは対象
      return r.isActiveStore                               // 閉店日なし＝現在の状態で代用
    })
    return {
      month: mk,
      stores: target.length,
      amount: target.reduce((sum, r) => sum + r.effectiveAmount, 0),
    }
  })

  return NextResponse.json({
    month,
    stores: {
      total: rows.length,
      active: activeRows.length,
      disabledAccounts,
      byStatus,
      withoutServices: rows.filter(r => r.serviceKeys.length === 0).length,
    },
    login,
    services: serviceRows,
    combos,
    fee: {
      billableStores: billableRows.length,
      unbillableActiveStores: activeRows.length - billableRows.length,
      overrideStores: rows.filter(r => r.overrideAmount > 0).length,
      monthlyTotal,
      annualTotal: monthlyTotal * 12,
      avgPerStore: billableRows.length > 0 ? Math.round(monthlyTotal / billableRows.length) : 0,
      byMonth,
    },
    rows: rows.map(r => ({
      id: r.id,
      name: r.name,
      code: r.code,
      prefecture: r.prefecture,
      status: r.status,
      statusLabel: r.statusLabel,
      isActiveStore: r.isActiveStore,
      hasLoggedIn: r.hasLoggedIn,
      lastLoginAt: r.lastLoginAt,
      services: r.services,
      serviceKeys: r.serviceKeys,
      autoAmount: r.autoAmount,
      overrideAmount: r.overrideAmount,
      effectiveAmount: r.effectiveAmount,
      note: r.note,
      billingActive: r.billingActive,
      openingDate: r.openingDate,
      closingDate: r.closingDate,
    })),
  })
}
