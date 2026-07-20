'use client'

// 顧客詳細モーダル内の「問い合わせ経路」セクション。
// 顧客に紐付くアクセス計測がある場合、どこから流入し・どのページを辿り・
// どのようにCV（問い合わせ/フォーム/CVボタン）に至ったかを経路として表示する。
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { CHANNEL_LABEL } from '@/lib/tracking-labels'
import type { CustomerJourneyResult, JourneyStep } from '@/lib/tracking-types'

const STEP_ICON: Record<JourneyStep['kind'], string> = {
  landing: '🛬',
  page: '📄',
  button: '👆',
  conversion: '🎯',
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export default function CustomerJourneyCard({ userId }: { userId: string }) {
  const [data, setData] = useState<CustomerJourneyResult | null>(null)

  useEffect(() => {
    setData(null)
    fetch(`/api/admin/users/${encodeURIComponent(userId)}/journey`)
      .then(r => (r.ok ? r.json() : { visitors: [] }))
      .then((d: CustomerJourneyResult) => setData(d))
      .catch(() => setData({ visitors: [] }))
  }, [userId])

  // 計測データがない顧客には何も出さない
  if (data === null || data.visitors.length === 0) return null

  return (
    <div className="rounded-xl p-3.5 border border-[var(--md-sys-color-outline-variant)]">
      <p className="text-[10px] font-semibold mb-3 text-[var(--md-sys-color-on-surface-variant)]">🛬 問い合わせ経路（アクセス計測）</p>

      <div className="space-y-4">
        {data.visitors.map(v => (
          <div key={v.id}>
            {/* 訪問者の流入サマリー */}
            <div className="flex items-center gap-2 flex-wrap text-[11px] mb-2">
              <span className="px-1.5 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high,#f0f0f0)] text-[var(--md-sys-color-on-surface-variant)]">
                {v.channel ? (CHANNEL_LABEL[v.channel] ?? v.channel) : '流入元不明'}
              </span>
              <span className="text-[var(--md-sys-color-on-surface)]">
                {v.firstReferrer
                  ? (() => { try { return new URL(v.firstReferrer!).hostname } catch { return v.firstReferrer } })()
                  : '直接流入'}
              </span>
              <span className="text-[var(--md-sys-color-on-surface-variant)] tabular-nums">
                訪問{v.sessionCount}回 ・ CV{v.conversionCount}件
              </span>
              <Link
                href={`/admin/analytics/visitors/${v.id}`}
                className="ml-auto text-[10px] text-[var(--md-sys-color-primary,#4f8ef7)] hover:underline"
              >
                ジャーニー詳細 →
              </Link>
            </div>

            {v.journeys.length === 0 ? (
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] pl-1">
                CV到達時の経路データがありません
              </p>
            ) : (
              <div className="space-y-3">
                {v.journeys.map(j => {
                  const utm = Object.entries(j.entryParams).filter(([k]) => /^utm_|^gclid|^yclid|^fbclid/i.test(k))
                  return (
                    <div
                      key={j.sessionId}
                      className="rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] p-2.5"
                    >
                      {/* CVヘッダー */}
                      <div className="flex items-center gap-2 flex-wrap mb-2">
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[rgba(74,222,128,0.15)] text-[#4ade80]">
                          {j.conversionType}
                        </span>
                        {j.storeName && (
                          <span className="text-[11px] text-[var(--md-sys-color-on-surface)]">{j.storeName}</span>
                        )}
                        <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] ml-auto tabular-nums">
                          {fmtDateTime(j.startedAt)}
                        </span>
                      </div>

                      {/* UTM / 広告パラメータ */}
                      {utm.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-2">
                          {utm.map(([k, val]) => (
                            <span
                              key={k}
                              className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--md-sys-color-surface-container-high,#f0f0f0)] text-[var(--md-sys-color-on-surface-variant)]"
                            >
                              {k}={val}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* 経路ステップ（縦タイムライン） */}
                      <ol className="relative space-y-1.5">
                        {j.steps.map((step, i) => (
                          <li key={i} className="flex items-start gap-2 text-[11px]">
                            <span className="shrink-0 leading-5" aria-hidden>{STEP_ICON[step.kind]}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-[var(--md-sys-color-on-surface)] truncate">{step.label}</span>
                                <span className="shrink-0 text-[9px] text-[var(--md-sys-color-on-surface-variant)] tabular-nums">
                                  {fmtTime(step.occurredAt)}
                                </span>
                              </div>
                              {step.sub && (
                                <div className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] truncate">{step.sub}</div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
