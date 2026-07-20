'use client'

// 訪問者詳細: 環境情報（デバイス/IP/地域等）+ セッション別ジャーニータイムライン + アトリビューション
import { useState, useEffect, use } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import LoadingSpinner from '@/components/LoadingSpinner'
import { CHANNEL_LABEL } from '@/lib/tracking-labels'
import type { VisitorDetail, VisitorTimelineItem } from '@/lib/tracking-types'

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const TIMELINE_ICON: Record<VisitorTimelineItem['kind'], { icon: string; label: string; color: string }> = {
  pageview: { icon: '📄', label: 'ページ閲覧', color: 'var(--md-sys-color-on-surface-variant)' },
  button_click: { icon: '👆', label: 'ボタンクリック', color: '#f59e0b' },
  inquiry_submit: { icon: '🎉', label: '問い合わせ送信', color: '#22c55e' },
  form_submit: { icon: '🎉', label: 'フォーム送信', color: '#22c55e' },
}

function EnvChip({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">{label}</p>
      <p className="text-xs font-medium truncate text-[var(--md-sys-color-on-surface)]" title={value ?? ''}>{value ?? '—'}</p>
    </div>
  )
}

export default function VisitorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: session, status } = useSession()
  const router = useRouter()
  const [data, setData] = useState<VisitorDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    const user = session.user as { role?: string }
    if (!['admin', 'superadmin', 'hr'].includes(user.role ?? '')) { router.push('/'); return }
    fetch(`/api/admin/tracking/visitors/${id}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .finally(() => setLoading(false))
  }, [status, session, router, id])

  if (loading || status === 'loading') return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  if (!data) {
    return <p className="text-sm text-center py-16 text-[var(--md-sys-color-on-surface-variant)]">訪問者が見つかりませんでした</p>
  }

  const attr = data.attribution

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface)]">
      <AppBar
        title="訪問者詳細"
        subtitle={`ID: ${data.visitorKey.slice(0, 18)}…`}
        actions={
          <Link href="/admin/analytics?tab=tracking" className="text-xs px-3 py-1.5 rounded-lg border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)]">
            ← アクセス解析へ
          </Link>
        }
      />

      <div className="max-w-4xl mx-auto px-4 py-5 space-y-4">
        {/* 概要 + アトリビューション */}
        <div className="rounded-2xl p-4 border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)]">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <EnvChip label="初回訪問" value={fmtDateTime(data.firstSeenAt)} />
            <EnvChip label="最終訪問" value={fmtDateTime(data.lastSeenAt)} />
            <EnvChip label="初回流入チャネル" value={attr.firstChannel ? (CHANNEL_LABEL[attr.firstChannel] ?? attr.firstChannel) : null} />
            <EnvChip label="初回リファラー" value={attr.firstReferrer} />
            <EnvChip label="CVまでの訪問回数" value={attr.sessionsToConversion !== null ? `${attr.sessionsToConversion}回目でCV` : 'CV未達'} />
            <EnvChip label="初回訪問→CVまで" value={attr.daysToConversion !== null ? `${attr.daysToConversion}日` : '—'} />
            <EnvChip label="初回流入パラメータ" value={Object.keys(attr.firstParams).length > 0 ? Object.entries(attr.firstParams).map(([k, v]) => `${k}=${v}`).join(', ') : 'なし'} />
            <div className="min-w-0">
              <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">紐付き顧客</p>
              {data.customer ? (
                <p className="text-xs font-medium text-[var(--md-sys-color-primary,#4f8ef7)]">👤 {data.customer.name}</p>
              ) : (
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">—</p>
              )}
            </div>
          </div>
        </div>

        {/* セッション別タイムライン */}
        {data.sessions.map((s, si) => (
          <div key={s.id} className="rounded-2xl p-4 border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)]">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
                セッション {data.sessions.length - si}
              </h3>
              <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{fmtDateTime(s.startedAt)}</span>
              {s.hasConversion && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(34,197,94,0.12)', color: '#16a34a' }}>CV達成</span>
              )}
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high,#f0f0f0)] text-[var(--md-sys-color-on-surface-variant)]">
                {s.channel ? (CHANNEL_LABEL[s.channel] ?? s.channel) : '不明'}
              </span>
            </div>

            {/* 環境情報パネル */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 rounded-xl p-3 bg-[var(--md-sys-color-surface-container-high,#f7f7f7)]">
              <EnvChip label="デバイス" value={s.deviceType === 'mobile' ? 'モバイル' : s.deviceType === 'tablet' ? 'タブレット' : s.deviceType === 'desktop' ? 'PC' : s.deviceType} />
              <EnvChip label="OS / ブラウザ" value={[s.os, s.browser].filter(Boolean).join(' / ') || null} />
              <EnvChip label="画面サイズ / 言語" value={[s.screenSize, s.language].filter(Boolean).join(' / ') || null} />
              <EnvChip label="IPアドレス" value={s.ipAddress} />
              <EnvChip label="地域" value={[s.country, s.region, s.city].filter(Boolean).join(' ') || null} />
              <EnvChip label="リファラー" value={s.referrer} />
              <EnvChip label="流入パラメータ" value={Object.keys(s.entryParams).length > 0 ? Object.entries(s.entryParams).map(([k, v]) => `${k}=${v}`).join(', ') : 'なし'} />
              <EnvChip label="User-Agent" value={s.userAgent} />
            </div>

            {/* タイムライン */}
            <div className="space-y-0">
              {s.timeline.map((item, i) => {
                const meta = TIMELINE_ICON[item.kind]
                return (
                  <div key={i} className="flex gap-2.5 relative pb-3">
                    {i < s.timeline.length - 1 && (
                      <span className="absolute left-[9px] top-6 bottom-0 w-px bg-[var(--md-sys-color-outline-variant)]" />
                    )}
                    <span className="text-sm w-5 flex-shrink-0 z-10">{meta.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-[var(--md-sys-color-on-surface)]">
                        <span className="font-semibold" style={{ color: item.kind !== 'pageview' ? meta.color : undefined }}>
                          {item.kind === 'pageview'
                            ? (item.title || item.url || 'ページ閲覧')
                            : item.kind === 'button_click'
                              ? `${meta.label}: ${item.buttonName ?? '不明なボタン'}`
                              : `${meta.label}${item.storeName ? `（${item.storeName}）` : ''}`}
                        </span>
                      </p>
                      <p className="text-[10px] tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
                        {fmtTime(item.occurredAt)}
                        {item.durationSec !== null && ` ・ 滞在 ${item.durationSec}秒`}
                        {item.scrollDepth !== null && ` ・ スクロール ${item.scrollDepth}%`}
                        {item.kind === 'pageview' && item.url && (
                          <span className="ml-1 break-all">{(() => { try { return new URL(item.url!).pathname } catch { return '' } })()}</span>
                        )}
                      </p>
                    </div>
                  </div>
                )
              })}
              {s.timeline.length === 0 && <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">ページビューの記録がありません</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
