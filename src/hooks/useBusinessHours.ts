'use client'

import { useState, useEffect } from 'react'
import { useStoreMasters } from '@/components/store/StoreMastersContext'

export type BusinessHours = {
  start: string // "HH:MM"
  end: string   // "HH:MM"
}

/**
 * ログイン中の店舗（顧客の場合は担当店舗）の営業時間を取得する。
 * 訪問スケジュールの時刻プルダウン（TimeSelect）の表示範囲を営業時間内に絞るために使う。
 * 取得前/失敗時は null を返す（TimeSelect 側は range 未指定として全時刻を表示）。
 *
 * 店舗ポータルではサーバー（layout.tsx）が解決済みの値を Context から読むので
 * **クライアント往復はゼロ**。以前はキャッシュを持たずコンポーネントごとに毎回叩いており、
 * スケジュール画面はページ本体とカレンダーで同じURLを2回取得していた。
 *
 * Provider の外（契約書ページ・顧客ポータルなど）では従来どおり API から取得する。
 */
export function useBusinessHours(): BusinessHours | null {
  const masters = useStoreMasters()
  const fromContext = masters
    ? { start: masters.businessHours.businessHoursStart, end: masters.businessHours.businessHoursEnd }
    : null

  const [hours, setHours] = useState<BusinessHours | null>(fromContext)

  useEffect(() => {
    // Context から取れているなら取得しない
    if (masters) { setHours(fromContext); return }
    let active = true
    fetch('/api/store/business-hours')
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (active && data) {
          setHours({
            start: data.businessHoursStart || '10:00',
            end: data.businessHoursEnd || '19:00',
          })
        }
      })
      .catch(() => {})
    return () => { active = false }
    // fromContext は masters から導出した値なので依存は masters だけでよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masters])

  return hours
}
