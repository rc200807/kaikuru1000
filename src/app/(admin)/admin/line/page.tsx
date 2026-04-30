'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'

/* ─── 型定義 ─────────────────────────────────────── */
type Channel = {
  id: string
  name: string
  channelId: string
  isActive: boolean
  userCount: number
  unreadCount: number
  storeId?: string | null
  store?: { id: string; name: string } | null
}

type StoreOption = { id: string; name: string }

type LastMessage = {
  content: string | null
  sentAt: string
  direction: string
  messageType: string
}

type LinkedUser = {
  id: string
  name: string
  furigana: string
  phone: string
}

type LineUser = {
  id: string
  lineUserId: string
  displayName: string
  pictureUrl: string | null
  channel: { id: string; name: string }
  linkedUser: LinkedUser | null
  lastMessage: LastMessage | null
  unreadCount: number
}

type Message = {
  id: string
  direction: string
  messageType: string
  content: string | null
  sentAt: string
  status?: string // "sent" | "failed" | "sending"
}

/* ─── チャネル設定モーダル ───────────────────────── */
function ChannelModal({
  channel,
  stores,
  onClose,
  onSaved,
}: {
  channel: Partial<Channel> | null
  stores: StoreOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const isNew = !channel?.id
  const [name, setName] = useState(channel?.name ?? '')
  const [channelId, setChannelId] = useState(channel?.channelId ?? '')
  const [channelSecret, setChannelSecret] = useState('')
  const [accessToken, setAccessToken] = useState('')
  const [storeId, setStoreId] = useState<string>(channel?.storeId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const webhookBase =
    typeof window !== 'undefined'
      ? `${window.location.origin}/api/webhooks/line/${channelId}`
      : ''

  async function handleSave() {
    if (!name || !channelId) { setError('表示名とチャネルIDは必須です'); return }
    if (isNew && (!channelSecret || !accessToken)) {
      setError('新規登録時はシークレットとトークンが必須です')
      return
    }
    setSaving(true)
    setError('')
    try {
      const body: any = { name, storeId: storeId || null }
      if (isNew) {
        body.channelId = channelId
        body.channelSecret = channelSecret
        body.channelAccessToken = accessToken
      } else {
        if (channelSecret) body.channelSecret = channelSecret
        if (accessToken) body.channelAccessToken = accessToken
      }

      const res = await fetch(
        isNew ? '/api/admin/line/channels' : `/api/admin/line/channels/${channel!.id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? 'エラーが発生しました')
        return
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--md-sys-color-surface)',
          borderRadius: 16, padding: 28, width: '100%', maxWidth: 520,
          maxHeight: '90vh', overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, color: 'var(--md-sys-color-on-surface)' }}>
          {isNew ? 'チャネルを追加' : 'チャネルを編集'}
        </h2>

        {[
          { label: '表示名', value: name, set: setName, placeholder: '例: 買いクル A' },
          { label: 'Channel ID', value: channelId, set: setChannelId, placeholder: '1234567890', disabled: !isNew },
          { label: `Channel Secret${isNew ? '' : '（変更する場合のみ）'}`, value: channelSecret, set: setChannelSecret, placeholder: isNew ? '必須' : '入力しない場合は変更なし', type: 'password' },
          { label: `Channel Access Token${isNew ? '' : '（変更する場合のみ）'}`, value: accessToken, set: setAccessToken, placeholder: isNew ? '必須' : '入力しない場合は変更なし', type: 'password' },
        ].map((f) => (
          <div key={f.label} style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 6 }}>
              {f.label}
            </label>
            <input
              type={f.type ?? 'text'}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              placeholder={f.placeholder}
              disabled={f.disabled}
              style={{
                width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 8,
                border: '1px solid var(--md-sys-color-outline-variant)',
                background: f.disabled ? 'var(--md-sys-color-surface-container)' : 'var(--md-sys-color-surface-container-highest)',
                color: 'var(--md-sys-color-on-surface)', fontSize: 14,
              }}
            />
          </div>
        ))}

        {channelId && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 6 }}>
              Webhook URL（LINE Developersコンソールに設定）
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                readOnly
                value={webhookBase}
                style={{
                  flex: 1, padding: '10px 14px', borderRadius: 8,
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  background: 'var(--md-sys-color-surface-container)',
                  color: 'var(--md-sys-color-on-surface-variant)', fontSize: 13,
                }}
              />
              <button
                onClick={() => navigator.clipboard.writeText(webhookBase)}
                style={{
                  padding: '0 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: 'var(--md-sys-color-secondary-container)',
                  color: 'var(--md-sys-color-on-secondary-container)', fontSize: 13,
                }}
              >
                コピー
              </button>
            </div>
          </div>
        )}

        {/* 店舗紐付け */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 6 }}>
            紐付け店舗（任意）
          </label>
          <select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 8,
              border: '1px solid var(--md-sys-color-outline-variant)',
              background: 'var(--md-sys-color-surface-container-highest)',
              color: 'var(--md-sys-color-on-surface)', fontSize: 14,
            }}
          >
            <option value="">— 紐付けなし（本部管理）—</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        {error && <p style={{ color: 'var(--md-sys-color-error)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--md-sys-color-surface-container-high)', color: 'var(--md-sys-color-on-surface)' }}>
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#4f8ef7', color: '#ffffff', fontWeight: 600, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── 分析モーダル ────────────────────────────────── */
function InsightsModal({
  channel,
  onClose,
}: {
  channel: Channel
  onClose: () => void
}) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/admin/line/channels/${channel.id}/insights`)
      .then(async r => {
        const d = await r.json()
        if (cancelled) return
        if (!r.ok) setError(d.error ?? '取得に失敗しました')
        else setData(d)
      })
      .catch(() => !cancelled && setError('ネットワークエラー'))
      .finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [channel.id])

  function diff(a?: number, b?: number) {
    if (a === undefined || b === undefined) return null
    const d = a - b
    if (d === 0) return null
    return d > 0 ? `+${d}` : `${d}`
  }

  function StatCard({ label, value, sub, color }: { label: string; value: React.ReactNode; sub?: React.ReactNode; color?: string }) {
    return (
      <div style={{ background: 'var(--md-sys-color-surface-container-high)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 6 }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 700, color: color ?? 'var(--md-sys-color-on-surface)' }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginTop: 4 }}>{sub}</div>}
      </div>
    )
  }

  const followersToday = data?.followersToday
  const followersWeekAgo = data?.followersWeekAgo
  const noFollowerData = followersToday?.status && followersToday.status !== 'ready'
  const followerError = followersToday?.error

  const delivery = data?.messageDelivery
  const noDeliveryData = delivery?.status && delivery.status !== 'ready'

  const demographic = data?.demographic
  const quotaConsumption = data?.quotaConsumption
  const quota = data?.quota

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={onClose}>
      <div style={{ background: 'var(--md-sys-color-surface)', borderRadius: 16, padding: 24, width: '100%', maxWidth: 720, maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>分析: {channel.name}</h2>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'var(--md-sys-color-surface-container-high)', color: 'var(--md-sys-color-on-surface)' }}>×</button>
        </div>

        {loading && <p style={{ textAlign: 'center', padding: 40, color: 'var(--md-sys-color-on-surface-variant)' }}>読み込み中...</p>}
        {error && <p style={{ color: '#f87171', fontSize: 13 }}>⚠ {error}</p>}

        {data && (
          <>
            <p style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 16 }}>
              集計日: {data.aggregateDate}（LINEの分析データは2〜3日遅れて反映されます）
            </p>

            {/* 友だち */}
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '8px 0 12px', color: '#e5e7eb' }}>友だち</h3>
            {followerError ? (
              <p style={{ fontSize: 13, color: '#f87171' }}>友だちデータ取得失敗: {followerError}</p>
            ) : noFollowerData ? (
              <p style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
                友だちが20人未満のためデータが提供されません（LINE仕様）
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 20 }}>
                <StatCard
                  label="友だち追加（累計）"
                  value={followersToday?.followers?.toLocaleString() ?? '—'}
                  sub={diff(followersToday?.followers, followersWeekAgo?.followers) && `7日前比 ${diff(followersToday?.followers, followersWeekAgo?.followers)}`}
                />
                <StatCard
                  label="ターゲットリーチ"
                  value={followersToday?.targetedReaches?.toLocaleString() ?? '—'}
                  sub={diff(followersToday?.targetedReaches, followersWeekAgo?.targetedReaches) && `7日前比 ${diff(followersToday?.targetedReaches, followersWeekAgo?.targetedReaches)}`}
                />
                <StatCard
                  label="ブロック（累計）"
                  value={followersToday?.blocks?.toLocaleString() ?? '—'}
                  sub={diff(followersToday?.blocks, followersWeekAgo?.blocks) && `7日前比 ${diff(followersToday?.blocks, followersWeekAgo?.blocks)}`}
                  color="#f87171"
                />
              </div>
            )}

            {/* メッセージ */}
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '20px 0 12px', color: '#e5e7eb' }}>メッセージ通数</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 12 }}>
              <StatCard
                label="当月の使用通数（課金対象）"
                value={quotaConsumption?.totalUsage?.toLocaleString() ?? '—'}
                sub={quota?.value ? `上限: ${quota.value.toLocaleString()}通 / ${quota.type}` : `プラン: ${quota?.type ?? '—'}`}
              />
              <StatCard
                label={`LINE側送信通数（${data.aggregateDate}）`}
                value={
                  noDeliveryData
                    ? '—'
                    : ((delivery?.broadcast ?? 0) + (delivery?.targeting ?? 0) + (delivery?.apiPush ?? 0) + (delivery?.apiBroadcast ?? 0) + (delivery?.apiMulticast ?? 0) + (delivery?.apiNarrowcast ?? 0)).toLocaleString()
                }
                sub={!noDeliveryData && `Push: ${delivery?.apiPush ?? 0} / Broadcast: ${(delivery?.broadcast ?? 0) + (delivery?.apiBroadcast ?? 0)}`}
              />
            </div>

            {/* 過去30日のメッセージ送信内訳 */}
            {data.messageStats && (
              <>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: '20px 0 12px', color: '#e5e7eb' }}>
                  過去30日 メッセージ送信内訳（合計 {data.messageStats.total.toLocaleString()}通）
                </h3>
                <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, marginBottom: 20 }}>
                  <MessageStatsBars stats={data.messageStats} />
                </div>
              </>
            )}

            {/* ポータル経由 */}
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: '20px 0 12px', color: '#e5e7eb' }}>当ポータル経由（過去7日間）</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
              <StatCard label="受信メッセージ" value={data.portal.inboundLast7Days.toLocaleString()} />
              <StatCard label="返信メッセージ" value={data.portal.outboundLast7Days.toLocaleString()} />
            </div>

            {/* デモグラ */}
            {demographic?.available && (
              <>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: '8px 0 12px', color: '#e5e7eb' }}>デモグラフィック（友だち属性）</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
                  {demographic.genders && (
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, color: '#e5e7eb' }}>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>性別</div>
                      <GenderPieChart data={demographic.genders} />
                    </div>
                  )}
                  {demographic.ages && (
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, color: '#e5e7eb' }}>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 12 }}>年代</div>
                      <AgeBarChart data={demographic.ages} />
                    </div>
                  )}
                  {demographic.appTypes && demographic.appTypes.length > 0 && (
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, color: '#e5e7eb' }}>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>デバイス種別</div>
                      {demographic.appTypes.map((a: any) => (
                        <div key={a.appType} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                          <span>{appTypeLabel(a.appType)}</span>
                          <span style={{ fontWeight: 700 }}>{a.percentage.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {demographic.subscriptionPeriods && demographic.subscriptionPeriods.length > 0 && (
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, color: '#e5e7eb' }}>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>友だち継続期間</div>
                      {demographic.subscriptionPeriods.map((s: any) => (
                        <div key={s.subscriptionPeriod} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                          <span>{subscriptionPeriodLabel(s.subscriptionPeriod)}</span>
                          <span style={{ fontWeight: 700 }}>{s.percentage.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {demographic.areas && demographic.areas.length > 0 && (
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, gridColumn: '1 / -1', color: '#e5e7eb' }}>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>エリア（上位）</div>
                      {demographic.areas.slice(0, 8).map((a: any) => (
                        <div key={a.area} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                          <span>{a.area}</span>
                          <span style={{ fontWeight: 700 }}>{a.percentage.toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* 取得可能な全期間の推移 */}
            {Array.isArray(data.history) && data.history.length > 0 && (
              <>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: '24px 0 12px', color: '#e5e7eb' }}>
                  友だち推移（{data.history.length}日分）
                </h3>
                <HistoryChart history={data.history} />
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** 年代ラベル変換 */
function ageLabel(age: string): string {
  if (age === 'unknown') return '不明'
  const m = age.match(/^from(\d+)to(\d+)$/)
  if (m) return `${m[1]}〜${m[2]}歳`
  const m2 = age.match(/^from(\d+)$/)
  if (m2) return `${m2[1]}歳以上`
  return age
}

/** デバイス種別ラベル */
function appTypeLabel(appType: string): string {
  switch (appType) {
    case 'ios': return 'iOS'
    case 'android': return 'Android'
    case 'pc': return 'PC'
    case 'others': return 'その他'
    case 'unknown': return '不明'
    default: return appType
  }
}

/** 友だち継続期間ラベル */
function subscriptionPeriodLabel(period: string): string {
  switch (period) {
    case 'within7days':       return '7日以内'
    case 'within30days':      return '8〜30日'
    case 'within90days':      return '31〜90日'
    case 'within180days':     return '91〜180日'
    case 'within365days':     return '181〜365日'
    case 'over365days':       return '365日超'
    case 'unknown':           return '不明'
    default: return period
  }
}

/** メッセージ送信種別ラベル */
const MESSAGE_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  broadcast:        { label: '一斉配信',          color: '#4f8ef7' },
  targeting:        { label: '絞り込み配信',      color: '#22c55e' },
  autoResponse:     { label: '応答メッセージ',    color: '#f59e0b' },
  welcomeResponse:  { label: 'あいさつメッセージ', color: '#a78bfa' },
  chat:             { label: 'チャット（手動）',  color: '#ec4899' },
  apiBroadcast:     { label: 'API一斉配信',       color: '#06b6d4' },
  apiPush:          { label: 'API Push',          color: '#10b981' },
  apiMulticast:     { label: 'APIマルチキャスト', color: '#8b5cf6' },
  apiNarrowcast:    { label: 'API絞り込み配信',   color: '#f43f5e' },
  apiReply:         { label: 'API返信',           color: '#facc15' },
}

/** メッセージ種別ごとの内訳（横棒グラフ） */
function MessageStatsBars({ stats }: { stats: any }) {
  const items = Object.entries(MESSAGE_TYPE_LABELS).map(([key, { label, color }]) => ({
    key, label, color, value: stats[key] ?? 0,
  }))
  const max = Math.max(...items.map(i => i.value), 1)
  // ゼロ件の項目はまとめて末尾に置く
  items.sort((a, b) => b.value - a.value)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((it) => (
        <div key={it.key} style={{ display: 'grid', gridTemplateColumns: '160px 1fr 70px', alignItems: 'center', gap: 10, fontSize: 12, color: '#e5e7eb' }}>
          <span style={{ color: '#d1d5db' }}>{it.label}</span>
          <div style={{ height: 14, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(it.value / max) * 100}%`, background: it.color, transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontWeight: 700, textAlign: 'right' }}>{it.value.toLocaleString()}通</span>
        </div>
      ))}
    </div>
  )
}

/** 性別 円グラフ */
function GenderPieChart({ data }: { data: { gender: string; percentage: number }[] }) {
  const colors: Record<string, string> = { female: '#f472b6', male: '#4f8ef7', unknown: '#9ca3af' }
  const labels: Record<string, string> = { female: '女性', male: '男性', unknown: '不明' }
  const size = 160
  const cx = size / 2
  const cy = size / 2
  const r = 70

  let acc = 0
  const arcs = data.map((d) => {
    const start = (acc / 100) * Math.PI * 2 - Math.PI / 2
    acc += d.percentage
    const end = (acc / 100) * Math.PI * 2 - Math.PI / 2
    const large = d.percentage > 50 ? 1 : 0
    const x1 = cx + r * Math.cos(start)
    const y1 = cy + r * Math.sin(start)
    const x2 = cx + r * Math.cos(end)
    const y2 = cy + r * Math.sin(end)
    return {
      ...d,
      path: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`,
      color: colors[d.gender] ?? '#9ca3af',
      label: labels[d.gender] ?? d.gender,
    }
  })

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {arcs.map((a, i) => <path key={i} d={a.path} fill={a.color} />)}
      </svg>
      <div style={{ flex: 1 }}>
        {arcs.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, background: a.color, borderRadius: 2, display: 'inline-block' }} />
              {a.label}
            </span>
            <span style={{ fontWeight: 700 }}>{a.percentage.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 年代 棒グラフ */
function AgeBarChart({ data }: { data: { age: string; percentage: number }[] }) {
  // 年齢でソート（不明・50歳以上は最後に）
  const ordered = [...data].sort((a, b) => {
    const order = (s: string) => {
      if (s === 'unknown') return 999
      if (s === 'from50') return 998 // 集計値「50歳以上」は別枠
      const m = s.match(/^from(\d+)/)
      return m ? Number(m[1]) : 1000
    }
    return order(a.age) - order(b.age)
  })

  const max = Math.max(...ordered.map(a => a.percentage), 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {ordered.map((a) => (
        <div key={a.age} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 50px', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ color: '#9ca3af' }}>{ageLabel(a.age)}</span>
          <div style={{ height: 16, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(a.percentage / max) * 100}%`, background: '#4f8ef7', transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontWeight: 700, textAlign: 'right' }}>{a.percentage.toFixed(1)}%</span>
        </div>
      ))}
    </div>
  )
}

/** 簡易折れ線グラフ（SVG） */
function HistoryChart({ history }: { history: { date: string; followers?: number; targetedReaches?: number; blocks?: number; delivery?: number }[] }) {
  const w = 640
  const h = 200
  const pad = { l: 40, r: 12, t: 12, b: 28 }

  const validFollowers = history.filter(d => d.followers !== undefined)
  const followers = history.map(d => d.followers ?? null)
  const reaches = history.map(d => d.targetedReaches ?? null)

  const allValues = [...followers, ...reaches].filter((v): v is number => v !== null)
  const max = allValues.length > 0 ? Math.max(...allValues) : 0
  const min = allValues.length > 0 ? Math.min(...allValues) : 0
  const range = max - min || 1

  const x = (i: number) => pad.l + (i * (w - pad.l - pad.r)) / Math.max(1, history.length - 1)
  const y = (v: number) => pad.t + (h - pad.t - pad.b) * (1 - (v - min) / range)

  function pathFor(arr: (number | null)[], color: string) {
    // null/undefined をスキップして有効なポイントだけを連結
    const points: { v: number; i: number }[] = []
    arr.forEach((v, i) => {
      if (v === null || v === undefined || Number.isNaN(v)) return
      points.push({ v: v as number, i })
    })
    if (points.length === 0) return null
    let path = `M ${x(points[0].i)} ${y(points[0].v)}`
    for (let k = 1; k < points.length; k++) {
      path += ` L ${x(points[k].i)} ${y(points[k].v)}`
    }
    return (
      <g>
        <path d={path} stroke={color} strokeWidth={2} fill="none" />
        {points.map(p => (
          <circle key={p.i} cx={x(p.i)} cy={y(p.v)} r={2} fill={color} />
        ))}
      </g>
    )
  }

  if (validFollowers.length === 0) {
    return (
      <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
        グラフデータが取得できませんでした（友だち20人未満または集計中）
      </div>
    )
  }

  return (
    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, color: '#e5e7eb' }}>
      <div style={{ display: 'flex', gap: 16, marginBottom: 8, fontSize: 11 }}>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#4f8ef7', borderRadius: 2, marginRight: 4 }} />友だち累計</span>
        <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#22c55e', borderRadius: 2, marginRight: 4 }} />ターゲットリーチ</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} style={{ width: '100%', height: 'auto' }}>
        {/* y軸グリッド */}
        {[0, 0.5, 1].map((p, i) => {
          const yv = pad.t + (h - pad.t - pad.b) * (1 - p)
          const v = Math.round(min + range * p)
          return (
            <g key={i}>
              <line x1={pad.l} y1={yv} x2={w - pad.r} y2={yv} stroke="rgba(255,255,255,0.08)" />
              <text x={pad.l - 6} y={yv + 4} fontSize={10} fill="#9ca3af" textAnchor="end">{v.toLocaleString()}</text>
            </g>
          )
        })}
        {/* x軸ラベル（最大8〜10個程度） */}
        {(() => {
          const N = history.length
          const tickCount = Math.min(8, N)
          const step = Math.max(1, Math.floor(N / tickCount))
          return history.filter((_, i) => i % step === 0 || i === N - 1).map((d) => {
            const idx = history.indexOf(d)
            const label = d.date.length === 10 ? d.date.slice(2).replace(/^(\d{2})-(\d{2})-(\d{2})$/, '$1/$2/$3') : d.date
            return (
              <text key={idx} x={x(idx)} y={h - 8} fontSize={10} fill="#9ca3af" textAnchor="middle">{label}</text>
            )
          })
        })()}
        {pathFor(followers, '#4f8ef7')}
        {pathFor(reaches, '#22c55e')}
      </svg>
    </div>
  )
}

/* ─── 顧客紐付けモーダル ─────────────────────────── */
function LinkUserModal({
  lineUser,
  onClose,
  onLinked,
}: {
  lineUser: LineUser
  onClose: () => void
  onLinked: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<LinkedUser[]>([])
  const [searching, setSearching] = useState(false)
  const [linking, setLinking] = useState(false)

  async function search() {
    if (!query.trim()) return
    setSearching(true)
    try {
      const res = await fetch(`/api/admin/customers?search=${encodeURIComponent(query)}&limit=20`)
      if (!res.ok) return
      const data = await res.json()
      setResults(data.customers ?? data ?? [])
    } finally {
      setSearching(false)
    }
  }

  async function link(userId: string | null) {
    setLinking(true)
    try {
      const res = await fetch(`/api/admin/line/users/${lineUser.id}/link`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (res.ok) { onLinked(); onClose() }
    } finally {
      setLinking(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: 'var(--md-sys-color-surface)', borderRadius: 16, padding: 28, width: '90%', maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: 'var(--md-sys-color-on-surface)' }}>
          顧客と紐付け
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 14, color: 'var(--md-sys-color-on-surface-variant)' }}>
          LINE: {lineUser.displayName}
        </p>

        {lineUser.linkedUser && (
          <div style={{ marginBottom: 16, padding: 12, background: 'var(--md-sys-color-surface-container)', borderRadius: 8 }}>
            <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>現在の紐付け</p>
            <p style={{ margin: 0, fontWeight: 600 }}>{lineUser.linkedUser.name}（{lineUser.linkedUser.furigana}）</p>
            <button
              onClick={() => link(null)}
              disabled={linking}
              style={{ marginTop: 8, padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)', fontSize: 13 }}
            >
              紐付けを解除
            </button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && search()}
            placeholder="顧客名・フリガナで検索"
            style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 14 }}
          />
          <button onClick={search} disabled={searching} style={{ padding: '0 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: '#4f8ef7', color: '#ffffff' }}>
            検索
          </button>
        </div>

        <div style={{ maxHeight: 240, overflowY: 'auto' }}>
          {results.map((u) => (
            <div
              key={u.id}
              onClick={() => link(u.id)}
              style={{ padding: '10px 14px', borderRadius: 8, cursor: 'pointer', marginBottom: 4, background: 'var(--md-sys-color-surface-container-high)' }}
            >
              <span style={{ fontWeight: 600 }}>{u.name}</span>
              <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>{u.furigana}</span>
              <span style={{ marginLeft: 8, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>{u.phone}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--md-sys-color-surface-container-high)', color: 'var(--md-sys-color-on-surface)' }}>
            閉じる
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── メインページ ────────────────────────────────── */
export default function LineManagePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [lineUsers, setLineUsers] = useState<LineUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [channelModal, setChannelModal] = useState<{ open: boolean; channel: Partial<Channel> | null }>({ open: false, channel: null })
  const [linkModal, setLinkModal] = useState<LineUser | null>(null)
  const [insightsChannel, setInsightsChannel] = useState<Channel | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [stores, setStores] = useState<StoreOption[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 認証チェック
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      const user = session?.user as any
      if (user?.role !== 'admin') router.push('/')
    }
  }, [status, session, router])

  const selectedUser = lineUsers.find((u) => u.id === selectedUserId) ?? null

  /* チャネル一覧 */
  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/line/channels')
      if (res.ok) setChannels(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchChannels()
      // 店舗一覧を取得
      fetch('/api/stores').then(r => r.ok ? r.json() : []).then(d => {
        const list = Array.isArray(d) ? d : (d.stores ?? [])
        setStores(list.map((s: any) => ({ id: s.id, name: s.name })))
      }).catch(() => {})
    }
  }, [status, fetchChannels])

  /* ユーザー一覧 */
  const fetchUsers = useCallback(async (channelId: string | null) => {
    setLoadingUsers(true)
    setSelectedUserId(null)
    setMessages([])
    try {
      const url = channelId
        ? `/api/admin/line/users?channelId=${channelId}`
        : '/api/admin/line/users'
      const res = await fetch(url)
      if (res.ok) setLineUsers(await res.json())
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  useEffect(() => {
    if (channels.length > 0) fetchUsers(selectedChannelId)
  }, [selectedChannelId, channels.length, fetchUsers])

  /* メッセージ */
  const fetchMessages = useCallback(async (userId: string) => {
    setLoadingMessages(true)
    try {
      const res = await fetch(`/api/admin/line/users/${userId}/messages`)
      if (res.ok) {
        const data: Message[] = await res.json()
        setMessages(data)
        // 未読カウントをクリア
        setLineUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, unreadCount: 0 } : u))
        )
      }
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  useEffect(() => {
    if (selectedUserId) fetchMessages(selectedUserId)
  }, [selectedUserId, fetchMessages])

  /* メッセージ末尾へスクロール */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /* 返信送信 */
  async function handleSend() {
    if (!replyText.trim() || !selectedUserId || sending) return
    setSending(true)
    setSendError('')
    try {
      const res = await fetch(`/api/admin/line/users/${selectedUserId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: replyText.trim() }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessages((prev) => [...prev, d])
        setReplyText('')
      } else {
        // 失敗時もメッセージ履歴に追加（failed ステータス付き）
        if (d.message) setMessages((prev) => [...prev, d.message])
        setSendError(d.error ?? '送信に失敗しました')
      }
    } catch {
      setSendError('ネットワークエラーが発生しました')
    } finally {
      setSending(false)
    }
  }

  /* チャネル削除 */
  async function deleteChannel(id: string, name: string) {
    if (!confirm(`「${name}」を削除しますか？関連するメッセージもすべて削除されます。`)) return
    await fetch(`/api/admin/line/channels/${id}`, { method: 'DELETE' })
    fetchChannels()
    if (selectedChannelId === id) setSelectedChannelId(null)
  }

  function formatTime(iso: string) {
    const d = new Date(iso)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
  }

  if (status === 'loading' || (status === 'authenticated' && loading)) return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <LoadingSpinner />
    </div>
  )

  if (status !== 'authenticated') return null

  /* ─── レイアウト定数 ─── */
  const colStyle = {
    base: {
      background: 'var(--md-sys-color-surface)',
      border: '1px solid var(--md-sys-color-outline-variant)',
      borderRadius: 12,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column' as const,
    },
    header: {
      padding: '14px 16px',
      borderBottom: '1px solid var(--md-sys-color-outline-variant)',
      fontWeight: 700,
      fontSize: 14,
      color: 'var(--md-sys-color-on-surface)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexShrink: 0,
    },
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--md-sys-color-on-surface)' }}>LINE 管理</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--md-sys-color-on-surface-variant)' }}>
          LINE 公式アカウントのメッセージを一括管理
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px 280px 1fr', gap: 12, height: 'calc(100vh - 200px)', minHeight: 500 }}>

        {/* ── 列1: チャネル一覧 ── */}
        <div style={colStyle.base}>
          <div style={colStyle.header}>
            <span>チャネル</span>
            <button
              onClick={() => setChannelModal({ open: true, channel: null })}
              style={{ width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer', background: 'var(--md-sys-color-primary-container)', color: 'var(--md-sys-color-on-primary-container)', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              title="チャネル追加"
            >
              +
            </button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {/* 「全チャネル」 */}
            <div
              onClick={() => { setSelectedChannelId(null); setOpenMenuId(null) }}
              style={{
                padding: '12px 14px', cursor: 'pointer', fontSize: 13,
                background: selectedChannelId === null ? 'rgba(79,142,247,0.15)' : 'transparent',
                color: selectedChannelId === null ? '#4f8ef7' : 'var(--md-sys-color-on-surface)',
                borderBottom: '1px solid var(--md-sys-color-outline-variant)',
                borderLeft: selectedChannelId === null ? '3px solid #4f8ef7' : '3px solid transparent',
                fontWeight: selectedChannelId === null ? 700 : 400,
              }}
            >
              すべてのチャネル
            </div>
            {channels.map((ch) => (
              <div
                key={ch.id}
                onClick={() => { setSelectedChannelId(ch.id); setOpenMenuId(null) }}
                style={{
                  padding: '12px 14px', cursor: 'pointer', position: 'relative',
                  background: selectedChannelId === ch.id ? 'rgba(79,142,247,0.15)' : 'transparent',
                  borderBottom: '1px solid var(--md-sys-color-outline-variant)',
                  borderLeft: selectedChannelId === ch.id ? '3px solid #4f8ef7' : '3px solid transparent',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: selectedChannelId === ch.id ? 700 : 400, color: 'var(--md-sys-color-on-surface)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ch.name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {ch.unreadCount > 0 && (
                      <span style={{ background: 'var(--md-sys-color-error)', color: 'white', borderRadius: 10, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>
                        {ch.unreadCount}
                      </span>
                    )}
                    {/* 3点リーダーボタン */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === ch.id ? null : ch.id) }}
                      style={{ width: 24, height: 24, borderRadius: 4, border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--md-sys-color-on-surface-variant)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                    >
                      ⋮
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{ch.userCount}人</span>
                  {ch.store && (
                    <span
                      title={ch.store.name}
                      style={{
                        background: 'rgba(79,142,247,0.18)',
                        color: '#4f8ef7',
                        borderRadius: 999,
                        padding: '2px 8px',
                        fontSize: 10,
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      店舗紐付け済み
                    </span>
                  )}
                  {!ch.isActive && <span style={{ color: 'var(--md-sys-color-error)' }}>無効</span>}
                </div>
                {/* ドロップダウンメニュー */}
                {openMenuId === ch.id && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      position: 'absolute', top: 36, right: 8, zIndex: 100,
                      background: 'var(--md-sys-color-surface-container-high)',
                      border: '1px solid var(--md-sys-color-outline-variant)',
                      borderRadius: 8, overflow: 'hidden', minWidth: 100,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    }}
                  >
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); setInsightsChannel(ch) }}
                      style={{ display: 'block', width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13, textAlign: 'left' }}
                    >
                      📊 分析
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); setChannelModal({ open: true, channel: ch }) }}
                      style={{ display: 'block', width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13, textAlign: 'left' }}
                    >
                      編集
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); deleteChannel(ch.id, ch.name) }}
                      style={{ display: 'block', width: '100%', padding: '10px 14px', border: 'none', cursor: 'pointer', background: 'transparent', color: '#f87171', fontSize: 13, textAlign: 'left' }}
                    >
                      削除
                    </button>
                  </div>
                )}
              </div>
            ))}
            {channels.length === 0 && (
              <p style={{ padding: 16, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)', textAlign: 'center' }}>
                チャネルがありません
              </p>
            )}
          </div>
        </div>

        {/* ── 列2: ユーザー一覧 ── */}
        <div style={colStyle.base}>
          <div style={colStyle.header}>
            <span>ユーザー</span>
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--md-sys-color-on-surface-variant)' }}>
              {lineUsers.length}人
            </span>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loadingUsers ? (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
                <LoadingSpinner />
              </div>
            ) : lineUsers.length === 0 ? (
              <p style={{ padding: 16, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)', textAlign: 'center' }}>
                ユーザーがいません
              </p>
            ) : (
              lineUsers.map((u) => (
                <div
                  key={u.id}
                  onClick={() => setSelectedUserId(u.id)}
                  style={{
                    padding: '12px 14px', cursor: 'pointer',
                    background: selectedUserId === u.id ? 'rgba(79,142,247,0.15)' : 'transparent',
                    borderBottom: '1px solid var(--md-sys-color-outline-variant)',
                    borderLeft: selectedUserId === u.id ? '3px solid #4f8ef7' : '3px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {u.pictureUrl ? (
                      <img
                        src={u.pictureUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                        style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
                        onError={(e) => { e.currentTarget.style.display = 'none' }}
                      />
                    ) : (
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--md-sys-color-surface-container-high)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                        👤
                      </div>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: 13, fontWeight: u.unreadCount > 0 ? 700 : 400, color: 'var(--md-sys-color-on-surface)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.linkedUser?.name ?? u.displayName}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          {u.unreadCount > 0 && (
                            <span style={{ background: 'var(--md-sys-color-error)', color: 'white', borderRadius: 10, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>
                              {u.unreadCount}
                            </span>
                          )}
                          {u.lastMessage && (
                            <span style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>
                              {formatTime(u.lastMessage.sentAt)}
                            </span>
                          )}
                        </div>
                      </div>
                      {u.linkedUser && (
                        <div style={{ fontSize: 11, color: 'var(--md-sys-color-primary)', marginBottom: 2 }}>
                          LINE: {u.displayName}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.lastMessage
                          ? (u.lastMessage.content ?? `[${u.lastMessage.messageType}]`)
                          : '— メッセージなし —'}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── 列3: メッセージスレッド ── */}
        <div style={colStyle.base}>
          {selectedUser ? (
            <>
              {/* ヘッダー */}
              <div style={{ ...colStyle.header, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {selectedUser.pictureUrl ? (
                    <img src={selectedUser.pictureUrl} alt="" referrerPolicy="no-referrer" crossOrigin="anonymous" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--md-sys-color-surface-container-high)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👤</div>
                  )}
                  <div>
                    <div style={{ fontWeight: 700 }}>{selectedUser.linkedUser?.name ?? selectedUser.displayName}</div>
                    {selectedUser.linkedUser && (
                      <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', fontWeight: 400 }}>
                        LINE: {selectedUser.displayName} ／ {selectedUser.channel.name}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setLinkModal(selectedUser)}
                  style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: selectedUser.linkedUser ? 'var(--md-sys-color-surface-container-high)' : 'var(--md-sys-color-primary-container)', color: selectedUser.linkedUser ? 'var(--md-sys-color-on-surface)' : 'var(--md-sys-color-on-primary-container)', fontSize: 12, fontWeight: 600 }}
                >
                  {selectedUser.linkedUser ? '紐付け変更' : '顧客と紐付け'}
                </button>
              </div>

              {/* メッセージ一覧 */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {loadingMessages ? (
                  <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
                    <LoadingSpinner />
                  </div>
                ) : messages.length === 0 ? (
                  <p style={{ textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)', fontSize: 13 }}>
                    メッセージがありません
                  </p>
                ) : (
                  messages.map((msg) => {
                    const isOutbound = msg.direction === 'outbound'
                    const isFailed = msg.status === 'failed'
                    return (
                      <div key={msg.id} style={{ display: 'flex', justifyContent: isOutbound ? 'flex-end' : 'flex-start', flexDirection: 'column', alignItems: isOutbound ? 'flex-end' : 'flex-start' }}>
                        <div
                          style={{
                            maxWidth: '72%', padding: '10px 14px', borderRadius: isOutbound ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                            background: isFailed ? 'rgba(248,113,113,0.15)' : isOutbound ? '#4f8ef7' : 'var(--md-sys-color-surface-container-high)',
                            color: isFailed ? '#f87171' : isOutbound ? '#ffffff' : 'var(--md-sys-color-on-surface)',
                            fontSize: 14, lineHeight: 1.5,
                            border: isFailed ? '1px solid rgba(248,113,113,0.4)' : 'none',
                          }}
                        >
                          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {msg.content ?? `[${msg.messageType}]`}
                          </div>
                          <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7, textAlign: isOutbound ? 'right' : 'left', display: 'flex', gap: 6, justifyContent: isOutbound ? 'flex-end' : 'flex-start', alignItems: 'center' }}>
                            {isFailed && <span style={{ color: '#f87171', opacity: 1 }}>送信失敗</span>}
                            {new Date(msg.sentAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* 返信入力 */}
              <div style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
              {sendError && (
                <p style={{ margin: 0, fontSize: 13, color: '#f87171', background: 'rgba(248,113,113,0.1)', padding: '8px 12px', borderRadius: 8 }}>
                  ⚠ {sendError}
                </p>
              )}
              <div style={{ display: 'flex', gap: 10 }}>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                  }}
                  placeholder="返信を入力（Enter で送信 / Shift+Enter で改行）"
                  rows={2}
                  style={{
                    flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--md-sys-color-outline-variant)',
                    background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)',
                    fontSize: 14, resize: 'none', fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !replyText.trim()}
                  style={{
                    padding: '0 20px', borderRadius: 10, border: 'none', cursor: 'pointer',
                    background: '#4f8ef7', color: '#ffffff',
                    fontWeight: 700, opacity: (sending || !replyText.trim()) ? 0.5 : 1,
                    alignSelf: 'stretch',
                  }}
                >
                  {sending ? '...' : '送信'}
                </button>
              </div>
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--md-sys-color-on-surface-variant)', fontSize: 14 }}>
              ユーザーを選択してください
            </div>
          )}
        </div>
      </div>

      {/* モーダル */}
      {channelModal.open && (
        <ChannelModal
          channel={channelModal.channel}
          stores={stores}
          onClose={() => setChannelModal({ open: false, channel: null })}
          onSaved={() => { fetchChannels(); fetchUsers(selectedChannelId) }}
        />
      )}
      {linkModal && (
        <LinkUserModal
          lineUser={linkModal}
          onClose={() => setLinkModal(null)}
          onLinked={() => fetchUsers(selectedChannelId)}
        />
      )}
      {insightsChannel && (
        <InsightsModal
          channel={insightsChannel}
          onClose={() => setInsightsChannel(null)}
        />
      )}
    </div>
  )
}
