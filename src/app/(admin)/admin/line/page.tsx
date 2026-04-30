'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import LoadingSpinner from '@/components/LoadingSpinner'

/* ─── 型定義 ─────────────────────────────────────── */
type Channel = {
  id: string
  name: string
  channelId: string
  isActive: boolean
  userCount: number
  unreadCount: number
}

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
}

/* ─── チャネル設定モーダル ───────────────────────── */
function ChannelModal({
  channel,
  onClose,
  onSaved,
}: {
  channel: Partial<Channel> | null
  onClose: () => void
  onSaved: () => void
}) {
  const isNew = !channel?.id
  const [name, setName] = useState(channel?.name ?? '')
  const [channelId, setChannelId] = useState(channel?.channelId ?? '')
  const [channelSecret, setChannelSecret] = useState('')
  const [accessToken, setAccessToken] = useState('')
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
      const body: any = { name }
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
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--md-sys-color-surface)',
          borderRadius: 16, padding: 28, width: '90%', maxWidth: 520,
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

        {error && <p style={{ color: 'var(--md-sys-color-error)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--md-sys-color-surface-container-high)', color: 'var(--md-sys-color-on-surface)' }}>
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '10px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', fontWeight: 600 }}
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
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
          <button onClick={search} disabled={searching} style={{ padding: '0 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)' }}>
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
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)
  const [lineUsers, setLineUsers] = useState<LineUser[]>([])
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [channelModal, setChannelModal] = useState<{ open: boolean; channel: Partial<Channel> | null }>({ open: false, channel: null })
  const [linkModal, setLinkModal] = useState<LineUser | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => { fetchChannels() }, [fetchChannels])

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
    try {
      const res = await fetch(`/api/admin/line/users/${selectedUserId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: replyText.trim() }),
      })
      if (res.ok) {
        const msg: Message = await res.json()
        setMessages((prev) => [...prev, msg])
        setReplyText('')
      }
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

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}>
      <LoadingSpinner />
    </div>
  )

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
              onClick={() => setSelectedChannelId(null)}
              style={{
                padding: '12px 14px', cursor: 'pointer', fontSize: 13,
                background: selectedChannelId === null ? 'var(--md-sys-color-secondary-container)' : 'transparent',
                color: selectedChannelId === null ? 'var(--md-sys-color-on-secondary-container)' : 'var(--md-sys-color-on-surface)',
                borderBottom: '1px solid var(--md-sys-color-outline-variant)',
              }}
            >
              すべてのチャネル
            </div>
            {channels.map((ch) => (
              <div
                key={ch.id}
                onClick={() => setSelectedChannelId(ch.id)}
                style={{
                  padding: '12px 14px', cursor: 'pointer',
                  background: selectedChannelId === ch.id ? 'var(--md-sys-color-secondary-container)' : 'transparent',
                  borderBottom: '1px solid var(--md-sys-color-outline-variant)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 13, fontWeight: selectedChannelId === ch.id ? 700 : 400, color: 'var(--md-sys-color-on-surface)' }}>
                    {ch.name}
                  </span>
                  {ch.unreadCount > 0 && (
                    <span style={{ background: 'var(--md-sys-color-error)', color: 'white', borderRadius: 10, padding: '1px 6px', fontSize: 11, fontWeight: 700 }}>
                      {ch.unreadCount}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>{ch.userCount}人</span>
                  {!ch.isActive && <span style={{ color: 'var(--md-sys-color-error)' }}>無効</span>}
                </div>
                {selectedChannelId === ch.id && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); setChannelModal({ open: true, channel: ch }) }}
                      style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', background: 'var(--md-sys-color-surface-container-high)', color: 'var(--md-sys-color-on-surface)' }}
                    >
                      編集
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteChannel(ch.id, ch.name) }}
                      style={{ fontSize: 11, padding: '3px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', background: 'var(--md-sys-color-error-container)', color: 'var(--md-sys-color-on-error-container)' }}
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
                    background: selectedUserId === u.id ? 'var(--md-sys-color-secondary-container)' : 'transparent',
                    borderBottom: '1px solid var(--md-sys-color-outline-variant)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {u.pictureUrl ? (
                      <img src={u.pictureUrl} alt="" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }} />
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
                    <img src={selectedUser.pictureUrl} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
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
                    return (
                      <div key={msg.id} style={{ display: 'flex', justifyContent: isOutbound ? 'flex-end' : 'flex-start' }}>
                        <div
                          style={{
                            maxWidth: '72%', padding: '10px 14px', borderRadius: isOutbound ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                            background: isOutbound ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-surface-container-high)',
                            color: isOutbound ? 'var(--md-sys-color-on-primary)' : 'var(--md-sys-color-on-surface)',
                            fontSize: 14, lineHeight: 1.5,
                          }}
                        >
                          <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {msg.content ?? `[${msg.messageType}]`}
                          </div>
                          <div style={{ fontSize: 11, marginTop: 4, opacity: 0.7, textAlign: isOutbound ? 'right' : 'left' }}>
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
              <div style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', padding: '12px 16px', display: 'flex', gap: 10, flexShrink: 0 }}>
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
                    background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)',
                    fontWeight: 700, opacity: (sending || !replyText.trim()) ? 0.5 : 1,
                    alignSelf: 'stretch',
                  }}
                >
                  {sending ? '...' : '送信'}
                </button>
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
    </div>
  )
}
