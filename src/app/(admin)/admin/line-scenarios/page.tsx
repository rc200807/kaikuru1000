'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'

/* ─── 型定義 ─────────────────────────────────────── */
type Step = {
  id?: string
  delayMinutes: number
  sendHour: number | null
  content: string
}

type Scenario = {
  id: string
  name: string
  triggerType: 'registration' | 'follow' | 'keyword'
  keyword: string | null
  store: { id: string; name: string } | null
  isActive: boolean
  steps: Step[]
  enrollmentCount: number
}

type StoreOption = { id: string; name: string }

type TalkUserOption = {
  id: string
  displayName: string
  linkedUser: { name: string } | null
}

const TRIGGER_LABELS: Record<Scenario['triggerType'], string> = {
  registration: 'LINE登録フォーム完了',
  follow: '友だち追加',
  keyword: 'キーワード応答',
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: 8,
  border: '1px solid var(--md-sys-color-outline-variant)',
  background: 'var(--md-sys-color-surface-container-highest)',
  color: 'var(--md-sys-color-on-surface)', fontSize: 14,
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 6,
}

/* ─── シナリオ編集モーダル ───────────────────────── */
function ScenarioModal({
  scenario,
  stores,
  onClose,
  onSaved,
}: {
  scenario: Scenario | null
  stores: StoreOption[]
  onClose: () => void
  onSaved: () => void
}) {
  const isNew = !scenario
  const [name, setName] = useState(scenario?.name ?? '')
  const [triggerType, setTriggerType] = useState<Scenario['triggerType']>(scenario?.triggerType ?? 'registration')
  const [keyword, setKeyword] = useState(scenario?.keyword ?? '')
  const [storeId, setStoreId] = useState(scenario?.store?.id ?? '')
  const [steps, setSteps] = useState<Step[]>(
    scenario?.steps?.length
      ? scenario.steps.map((s) => ({ ...s }))
      : [{ delayMinutes: 0, sendHour: null, content: '' }]
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isKeyword = triggerType === 'keyword'
  const visibleSteps = isKeyword ? steps.slice(0, 1) : steps

  function updateStep(index: number, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  function addStep() {
    setSteps((prev) => [...prev, { delayMinutes: 1440 * (prev.length), sendHour: 10, content: '' }])
  }

  function removeStep(index: number) {
    setSteps((prev) => prev.filter((_, i) => i !== index))
  }

  function moveStep(index: number, dir: -1 | 1) {
    setSteps((prev) => {
      const next = [...prev]
      const target = index + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[index], next[target]] = [next[target], next[index]]
      return next
    })
  }

  async function handleSave() {
    if (!name.trim()) { setError('シナリオ名は必須です'); return }
    if (isKeyword && !keyword.trim()) { setError('キーワードは必須です'); return }
    const payloadSteps = visibleSteps.map((s) => ({
      delayMinutes: isKeyword ? 0 : s.delayMinutes,
      sendHour: isKeyword ? null : s.sendHour,
      content: s.content,
    }))
    if (payloadSteps.some((s) => !s.content.trim())) { setError('本文が未入力のステップがあります'); return }

    setSaving(true)
    setError('')
    try {
      const body = {
        name: name.trim(),
        triggerType,
        keyword: isKeyword ? keyword.trim() : null,
        storeId: storeId || null,
        steps: payloadSteps,
      }
      const res = await fetch(
        isNew ? '/api/admin/line-scenarios' : `/api/admin/line-scenarios/${scenario!.id}`,
        {
          method: isNew ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
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
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--md-sys-color-surface)',
          borderRadius: 16, padding: 28, width: '100%', maxWidth: 640,
          maxHeight: '90vh', overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, color: 'var(--md-sys-color-on-surface)' }}>
          {isNew ? 'シナリオを作成' : 'シナリオを編集'}
        </h2>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>シナリオ名</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例: 登録後ウェルカム配信" style={inputStyle} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={labelStyle}>トリガー</label>
            <select value={triggerType} onChange={(e) => setTriggerType(e.target.value as Scenario['triggerType'])} style={inputStyle}>
              <option value="registration">LINE登録フォーム完了</option>
              <option value="follow">友だち追加</option>
              <option value="keyword">キーワード応答</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>対象店舗</label>
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)} style={inputStyle}>
              <option value="">全店共通</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {isKeyword && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>キーワード（受信メッセージに含まれると自動応答）</label>
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="例: 査定" style={inputStyle} />
          </div>
        )}

        <div style={{ marginBottom: 8 }}>
          <label style={labelStyle}>
            {isKeyword ? '応答メッセージ' : '配信ステップ'}
            <span style={{ marginLeft: 8, fontSize: 12 }}>
              本文に {'{name}'}（お客様名）と {'{storeName}'}（店舗名）が使えます
            </span>
          </label>
        </div>

        {visibleSteps.map((step, i) => (
          <div
            key={i}
            style={{
              border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 12,
              padding: 14, marginBottom: 12, background: 'var(--md-sys-color-surface-container-low)',
            }}
          >
            {!isKeyword && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--md-sys-color-on-surface)' }}>
                  ステップ {i + 1}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>トリガーから</span>
                  <input
                    type="number"
                    min={0}
                    max={365}
                    value={Math.floor(step.delayMinutes / 1440)}
                    onChange={(e) => updateStep(i, { delayMinutes: Math.max(0, Number(e.target.value) || 0) * 1440 })}
                    style={{ ...inputStyle, width: 72, padding: '6px 10px' }}
                  />
                  <span style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>日後</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>配信時刻</span>
                  <select
                    value={step.sendHour == null ? '' : String(step.sendHour)}
                    onChange={(e) => updateStep(i, { sendHour: e.target.value === '' ? null : Number(e.target.value) })}
                    style={{ ...inputStyle, width: 110, padding: '6px 10px' }}
                  >
                    <option value="">指定なし</option>
                    {Array.from({ length: 24 }, (_, h) => (
                      <option key={h} value={h}>{h}:00</option>
                    ))}
                  </select>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <button onClick={() => moveStep(i, -1)} disabled={i === 0} title="上へ" style={{ padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--md-sys-color-surface-container-high)', color: 'var(--md-sys-color-on-surface)', opacity: i === 0 ? 0.4 : 1 }}>↑</button>
                  <button onClick={() => moveStep(i, 1)} disabled={i === visibleSteps.length - 1} title="下へ" style={{ padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'var(--md-sys-color-surface-container-high)', color: 'var(--md-sys-color-on-surface)', opacity: i === visibleSteps.length - 1 ? 0.4 : 1 }}>↓</button>
                  {visibleSteps.length > 1 && (
                    <button onClick={() => removeStep(i)} title="削除" style={{ padding: '4px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', background: 'transparent', color: '#f87171' }}>✕</button>
                  )}
                </div>
              </div>
            )}
            <textarea
              value={step.content}
              onChange={(e) => updateStep(i, { content: e.target.value })}
              rows={4}
              placeholder={'例: {name}様、{storeName}の友だち登録ありがとうございます！\nこのトークに品物の写真を送るだけで簡易査定ができます📷'}
              style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>
        ))}

        {!isKeyword && visibleSteps.length < 20 && (
          <button
            onClick={addStep}
            style={{
              width: '100%', padding: '10px', borderRadius: 10, marginBottom: 16, cursor: 'pointer',
              border: '2px dashed var(--md-sys-color-outline-variant)', background: 'transparent',
              color: 'var(--md-sys-color-on-surface-variant)', fontSize: 13,
            }}
          >
            + ステップを追加
          </button>
        )}

        {error && <p style={{ color: 'var(--md-sys-color-error)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        {!isNew && scenario && scenario.enrollmentCount > 0 && (
          <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 12 }}>
            ⚠ ステップを保存すると、配信中（{scenario.enrollmentCount}人）の未送信メッセージはキャンセルされます
          </p>
        )}

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

/* ─── テスト送信モーダル ─────────────────────────── */
function TestSendModal({
  scenario,
  onClose,
}: {
  scenario: Scenario
  onClose: () => void
}) {
  const [users, setUsers] = useState<TalkUserOption[]>([])
  const [query, setQuery] = useState('')
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin/line-talk/users')
      .then(r => r.ok ? r.json() : { users: [] })
      .then(d => setUsers(d.users ?? []))
      .catch(() => {})
  }, [])

  const filtered = users.filter((u) => {
    if (!query) return true
    const hay = `${u.displayName} ${u.linkedUser?.name ?? ''}`.toLowerCase()
    return hay.includes(query.toLowerCase())
  }).slice(0, 20)

  async function send(lineUserId: string) {
    setSending(true)
    setError('')
    setResult('')
    try {
      const res = await fetch(`/api/admin/line-scenarios/${scenario.id}/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineUserId }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        setResult(`${d.sent}件のメッセージをテスト送信しました`)
      } else {
        setError(d.error ?? '送信に失敗しました')
      }
    } catch {
      setError('ネットワークエラーが発生しました')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--md-sys-color-surface)', borderRadius: 16, padding: 28, width: '100%', maxWidth: 480, maxHeight: '80vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: 'var(--md-sys-color-on-surface)' }}>
          テスト送信
        </h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
          「{scenario.name}」の全ステップを選択したユーザーへ即時送信します（本番配信の通数を消費します）
        </p>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="名前で検索"
          style={{ ...inputStyle, marginBottom: 12 }}
        />

        {result && <p style={{ color: '#4ade80', fontSize: 13, marginBottom: 12 }}>✓ {result}</p>}
        {error && <p style={{ color: 'var(--md-sys-color-error)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
          {filtered.map((u) => (
            <div
              key={u.id}
              onClick={() => !sending && send(u.id)}
              style={{ padding: '10px 14px', borderRadius: 8, cursor: sending ? 'default' : 'pointer', marginBottom: 4, background: 'var(--md-sys-color-surface-container-high)', opacity: sending ? 0.6 : 1 }}
            >
              <span style={{ fontWeight: 600, color: 'var(--md-sys-color-on-surface)' }}>
                {u.linkedUser?.name ?? u.displayName}
              </span>
              {u.linkedUser && (
                <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
                  LINE: {u.displayName}
                </span>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)', textAlign: 'center', padding: 16 }}>
              対象ユーザーがいません
            </p>
          )}
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
export default function LineScenariosPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [channel, setChannel] = useState<{ id: string; name: string } | null>(null)
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [quota, setQuota] = useState<{ totalUsage: number; limit: number | null } | null>(null)
  const [stores, setStores] = useState<StoreOption[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; scenario: Scenario | null }>({ open: false, scenario: null })
  const [testModal, setTestModal] = useState<Scenario | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      const user = session?.user as any
      if (!['admin','superadmin','hr'].includes(user?.role)) router.push('/')
    }
  }, [status, session, router])

  const fetchScenarios = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/line-scenarios')
      if (res.ok) {
        const d = await res.json()
        setChannel(d.channel)
        setScenarios(d.scenarios ?? [])
        setQuota(d.quota)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchScenarios()
      fetch('/api/stores').then(r => r.ok ? r.json() : []).then(d => {
        const list = Array.isArray(d) ? d : (d.stores ?? [])
        setStores(list.map((s: any) => ({ id: s.id, name: s.name })))
      }).catch(() => {})
    }
  }, [status, fetchScenarios])

  async function toggleActive(s: Scenario) {
    const next = !s.isActive
    if (!next && s.enrollmentCount > 0) {
      if (!confirm(`「${s.name}」を無効化すると、配信中の未送信メッセージはキャンセルされます。よろしいですか？`)) return
    }
    const res = await fetch(`/api/admin/line-scenarios/${s.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: next }),
    })
    if (res.ok) fetchScenarios()
  }

  async function deleteScenario(s: Scenario) {
    if (!confirm(`「${s.name}」を削除しますか？未送信の配信予定もキャンセルされます。`)) return
    await fetch(`/api/admin/line-scenarios/${s.id}`, { method: 'DELETE' })
    fetchScenarios()
  }

  function describeStep(step: Step): string {
    const days = Math.floor(step.delayMinutes / 1440)
    const timing = step.delayMinutes === 0 ? '即時' : `${days}日後`
    const hour = step.sendHour != null ? ` ${step.sendHour}:00` : ''
    return `${timing}${hour}`
  }

  if (status === 'loading' || (status === 'authenticated' && loading)) return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <LoadingSpinner />
    </div>
  )

  if (status !== 'authenticated') return null

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--md-sys-color-on-surface)' }}>LINE自動配信</h1>
          <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--md-sys-color-on-surface-variant)' }}>
            {channel
              ? `${channel.name} — 友だち登録後のステップ配信・キーワード自動応答を設定`
              : '既定チャネルが設定されていません（LINE管理のチャネル編集から設定してください）'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {quota && (
            <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', textAlign: 'right' }}>
              今月の送信通数
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--md-sys-color-on-surface)' }}>
                {quota.totalUsage.toLocaleString()}{quota.limit != null ? ` / ${quota.limit.toLocaleString()}` : ''}
              </div>
            </div>
          )}
          <button
            onClick={() => setModal({ open: true, scenario: null })}
            disabled={!channel}
            style={{ padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', background: '#4f8ef7', color: '#ffffff', fontWeight: 700, fontSize: 14, opacity: channel ? 1 : 0.5 }}
          >
            + シナリオを作成
          </button>
        </div>
      </div>

      {scenarios.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', border: '1px dashed var(--md-sys-color-outline-variant)', borderRadius: 12, color: 'var(--md-sys-color-on-surface-variant)', fontSize: 14 }}>
          シナリオがまだありません。「シナリオを作成」から始めましょう。
          <div style={{ fontSize: 12, marginTop: 8 }}>
            例: 登録直後のウェルカムメッセージ → 翌日の写真査定案内 → 3日後の出張買取訴求
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {scenarios.map((s) => (
            <div
              key={s.id}
              style={{
                border: '1px solid var(--md-sys-color-outline-variant)', borderRadius: 12,
                padding: '16px 20px', background: 'var(--md-sys-color-surface)',
                opacity: s.isActive ? 1 : 0.6,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--md-sys-color-on-surface)' }}>{s.name}</span>
                <span style={{ background: 'rgba(79,142,247,0.18)', color: '#4f8ef7', borderRadius: 999, padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>
                  {TRIGGER_LABELS[s.triggerType]}
                  {s.triggerType === 'keyword' && s.keyword ? `「${s.keyword}」` : ''}
                </span>
                <span style={{ background: 'var(--md-sys-color-surface-container-high)', color: 'var(--md-sys-color-on-surface-variant)', borderRadius: 999, padding: '2px 10px', fontSize: 11 }}>
                  {s.store ? s.store.name : '全店共通'}
                </span>
                {s.triggerType !== 'keyword' && (
                  <span style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
                    配信済/配信中 {s.enrollmentCount}人
                  </span>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => toggleActive(s)}
                    style={{
                      padding: '6px 14px', borderRadius: 999, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                      background: s.isActive ? 'rgba(74,222,128,0.15)' : 'var(--md-sys-color-surface-container-high)',
                      color: s.isActive ? '#4ade80' : 'var(--md-sys-color-on-surface-variant)',
                    }}
                  >
                    {s.isActive ? '有効' : '無効'}
                  </button>
                  <button onClick={() => setTestModal(s)} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', cursor: 'pointer', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 12 }}>
                    テスト送信
                  </button>
                  <button onClick={() => setModal({ open: true, scenario: s })} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--md-sys-color-surface-container-high)', color: 'var(--md-sys-color-on-surface)', fontSize: 12 }}>
                    編集
                  </button>
                  <button onClick={() => deleteScenario(s)} style={{ padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'transparent', color: '#f87171', fontSize: 12 }}>
                    削除
                  </button>
                </div>
              </div>

              {/* ステップのタイムライン表示 */}
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {s.steps.map((step, i) => (
                  <div key={step.id ?? i} style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                    <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 700, color: '#4f8ef7', minWidth: 86 }}>
                      {s.triggerType === 'keyword' ? '即時応答' : describeStep(step)}
                    </span>
                    <span style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {step.content}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {modal.open && (
        <ScenarioModal
          scenario={modal.scenario}
          stores={stores}
          onClose={() => setModal({ open: false, scenario: null })}
          onSaved={fetchScenarios}
        />
      )}
      {testModal && (
        <TestSendModal scenario={testModal} onClose={() => setTestModal(null)} />
      )}
    </div>
  )
}
