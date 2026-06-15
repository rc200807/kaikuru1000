'use client'

import { useState, useEffect } from 'react'

export type BusinessHours = {
  start: string // "HH:MM"
  end: string   // "HH:MM"
}

/**
 * ログイン中の店舗（顧客の場合は担当店舗）の営業時間を取得する。
 * 訪問スケジュールの時刻プルダウン（TimeSelect）の表示範囲を営業時間内に絞るために使う。
 * 取得前/失敗時は null を返す（TimeSelect 側は range 未指定として全時刻を表示）。
 */
export function useBusinessHours(): BusinessHours | null {
  const [hours, setHours] = useState<BusinessHours | null>(null)

  useEffect(() => {
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
  }, [])

  return hours
}
