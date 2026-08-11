'use client'

// 「店舗利用状況」ページの各タブで共有するデータ取得フック。
// /api/sysadmin/store-usage を叩き、再読込（reload）を返す。

import { useCallback, useEffect, useState } from 'react'

export type UsageServiceRow = {
  serviceKey: string
  label: string
  monthlyAmount: number
  isActive: boolean
  inMaster: boolean
  stores: number
  activeStores: number
  loggedInStores: number
  activeLoggedInStores: number
  monthlyRevenue: number
}

export type UsageStoreRow = {
  id: string
  name: string
  code: string
  prefecture: string | null
  status: string
  statusLabel: string
  isActiveStore: boolean
  /** 店舗管理の「ログイン状態」と同じ判定（一度でもログインした実績があるか） */
  hasLoggedIn: boolean
  lastLoginAt: string | null
  services: { serviceKey: string; label: string; amount: number }[]
  serviceKeys: string[]
  autoAmount: number
  overrideAmount: number
  effectiveAmount: number
  note: string
  /** Stripe 自動課金の対象フラグ（このページでは変更しない・保存時にそのまま送り返す） */
  billingActive: boolean
  openingDate: string | null
  closingDate: string | null
}

export type StoreUsage = {
  month: string
  stores: {
    total: number
    active: number
    disabledAccounts: number
    withoutServices: number
    byStatus: { value: string; label: string; count: number; loggedIn: number }[]
  }
  login: {
    recentDays: number
    loggedIn: number
    never: number
    recent: number
    activeTotal: number
    activeLoggedIn: number
    activeNever: number
    activeRecent: number
  }
  services: UsageServiceRow[]
  combos: { key: string; label: string; count: number; activeCount: number; loggedInCount: number }[]
  fee: {
    billableStores: number
    unbillableActiveStores: number
    overrideStores: number
    monthlyTotal: number
    annualTotal: number
    avgPerStore: number
    byMonth: { month: string; stores: number; amount: number }[]
  }
  rows: UsageStoreRow[]
}

export function useStoreUsage() {
  const [data, setData] = useState<StoreUsage | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const res = await fetch('/api/sysadmin/store-usage')
    if (!res.ok) return
    setData(await res.json())
  }, [])

  useEffect(() => {
    reload().finally(() => setLoading(false))
  }, [reload])

  return { data, loading, reload }
}
