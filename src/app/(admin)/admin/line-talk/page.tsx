'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'

/* ─── 型定義 ─────────────────────────────────────── */
type StoreOption = { id: string; name: string }

type LastMessage = {
  content: string | null
  sentAt: string
  direction: string
  messageType: string
}

type TalkUser = {
  id: string
  lineUserId: string
  displayName: string
  pictureUrl: string | null
  store: { id: string; name: string } | null
  linkedUser: { id: string; name: string; furigana: string; phone: string } | null
  isFollowing: boolean
  lastMessage: LastMessage | null
  unreadCount: number
}

type Message = {
  id: string
  direction: string
  messageType: string
  content: string | null
  imageUrl?: string | null
  sentAt: string
  status?: string
}

type FilterValue = 'all' | 'unassigned' | string // string = storeId

/* ─── メインページ ────────────────────────────────── */
export default function LineTalkPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [channel, setChannel] = useState<{ id: string; name: string } | null>(null)
  const [users, setUsers] = useState<TalkUser[]>([])
  const [stores, setStores] = useState<StoreOption[]>([])
  const [filter, setFilter] = useState<FilterValue>('all')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // 認証チェック
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      const user = session?.user as any
      if (!['admin','superadmin','hr'].includes(user?.role)) router.push('/')
    }
  }, [status, session, router])

  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null

  /* ユーザー一覧 */
  const fetchUsers = useCallback(async (f: FilterValue) => {
    setLoadingUsers(true)
    try {
      const qs = f === 'all' ? '' : f === 'unassigned' ? '?unassigned=1' : `?storeId=${f}`
      const res = await fetch(`/api/admin/line-talk/users${qs}`)
      if (res.ok) {
        const data = await res.json()
        setChannel(data.channel)
        setUsers(data.users)
      }
    } finally {
      setLoadingUsers(false)
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (status === 'authenticated') {
      fetchUsers(filter)
      fetch('/api/stores').then(r => r.ok ? r.json() : []).then(d => {
        const list = Array.isArray(d) ? d : (d.stores ?? [])
        setStores(list.map((s: any) => ({ id: s.id, name: s.name })))
      }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  function changeFilter(f: FilterValue) {
    setFilter(f)
    setSelectedUserId(null)
    setMessages([])
    fetchUsers(f)
  }

  /* メッセージ */
  const fetchMessages = useCallback(async (userId: string) => {
    setLoadingMessages(true)
    try {
      const res = await fetch(`/api/admin/line/users/${userId}/messages`)
      if (res.ok) {
        setMessages(await res.json())
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, unreadCount: 0 } : u)))
      }
    } finally {
      setLoadingMessages(false)
    }
  }, [])

  useEffect(() => {
    if (selectedUserId) fetchMessages(selectedUserId)
  }, [selectedUserId, fetchMessages])

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
        if (d.message) setMessages((prev) => [...prev, d.message])
        setSendError(d.error ?? '送信に失敗しました')
      }
    } catch {
      setSendError('ネットワークエラーが発生しました')
    } finally {
      setSending(false)
    }
  }

  /* 店舗割当変更 */
  async function handleAssign(storeId: string) {
    if (!selectedUserId || assigning) return
    setAssigning(true)
    try {
      const res = await fetch(`/api/admin/line-talk/users/${selectedUserId}/assign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: storeId || null }),
      })
      if (res.ok) {
        const d = await res.json()
        setUsers((prev) => prev.map((u) => (u.id === selectedUserId ? { ...u, store: d.store } : u)))
      }
    } finally {
      setAssigning(false)
    }
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

  const storeBadge = (store: { id: string; name: string } | null) => (
    <span
      style={{
        background: store ? 'rgba(79,142,247,0.18)' : 'rgba(248,113,113,0.15)',
        color: store ? '#4f8ef7' : '#f87171',
        borderRadius: 999,
        padding: '2px 8px',
        fontSize: 10,
        fontWeight: 600,
        whiteSpace: 'nowrap',
        maxWidth: 120,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        display: 'inline-block',
        verticalAlign: 'middle',
      }}
    >
      {store ? store.name : '未割当'}
    </span>
  )

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--md-sys-color-on-surface)' }}>LINEトーク</h1>
        <p style={{ margin: '4px 0 0', fontSize: 14, color: 'var(--md-sys-color-on-surface-variant)' }}>
          {channel ? `${channel.name} — 店舗割当付きトーク一覧` : '既定チャネルが設定されていません（LINE管理のチャネル編集から設定してください）'}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 12, height: 'calc(100vh - 200px)', minHeight: 500 }}>

        {/* ── 列1: ユーザー一覧（店舗フィルタ付き） ── */}
        <div style={colStyle.base}>
          <div style={{ ...colStyle.header, flexDirection: 'column' as const, alignItems: 'stretch', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>トーク</span>
              <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--md-sys-color-on-surface-variant)' }}>
                {users.length}人
              </span>
            </div>
            <select
              value={filter}
              onChange={(e) => changeFilter(e.target.value as FilterValue)}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13,
                border: '1px solid var(--md-sys-color-outline-variant)',
                background: 'var(--md-sys-color-surface-container-highest)',
                color: 'var(--md-sys-color-on-surface)',
              }}
            >
              <option value="all">すべての店舗</option>
              <option value="unassigned">未割当のみ</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loadingUsers ? (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 40 }}>
                <LoadingSpinner />
              </div>
            ) : users.length === 0 ? (
              <p style={{ padding: 16, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)', textAlign: 'center' }}>
                ユーザーがいません
              </p>
            ) : (
              users.map((u) => (
                <div
                  key={u.id}
                  onClick={() => setSelectedUserId(u.id)}
                  style={{
                    padding: '12px 14px', cursor: 'pointer',
                    background: selectedUserId === u.id ? 'rgba(79,142,247,0.15)' : 'transparent',
                    borderBottom: '1px solid var(--md-sys-color-outline-variant)',
                    borderLeft: selectedUserId === u.id ? '3px solid #4f8ef7' : '3px solid transparent',
                    opacity: u.isFollowing ? 1 : 0.55,
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
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '2px 0' }}>
                        {storeBadge(u.store)}
                        {!u.isFollowing && (
                          <span style={{ fontSize: 10, color: 'var(--md-sys-color-on-surface-variant)' }}>ブロック中</span>
                        )}
                      </div>
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

        {/* ── 列2: メッセージスレッド ── */}
        <div style={colStyle.base}>
          {selectedUser ? (
            <>
              {/* ヘッダー */}
              <div style={{ ...colStyle.header, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  {selectedUser.pictureUrl ? (
                    <img src={selectedUser.pictureUrl} alt="" referrerPolicy="no-referrer" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--md-sys-color-surface-container-high)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>👤</div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedUser.linkedUser?.name ?? selectedUser.displayName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', fontWeight: 400 }}>
                      {selectedUser.linkedUser ? `LINE: ${selectedUser.displayName}` : '顧客未紐付け'}
                      {selectedUser.linkedUser?.phone ? ` ／ ${selectedUser.linkedUser.phone}` : ''}
                    </div>
                  </div>
                </div>
                {/* 店舗割当セレクト */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--md-sys-color-on-surface-variant)' }}>担当店舗</span>
                  <select
                    value={selectedUser.store?.id ?? ''}
                    onChange={(e) => handleAssign(e.target.value)}
                    disabled={assigning}
                    style={{
                      padding: '6px 10px', borderRadius: 8, fontSize: 13, maxWidth: 200,
                      border: '1px solid var(--md-sys-color-outline-variant)',
                      background: 'var(--md-sys-color-surface-container-highest)',
                      color: 'var(--md-sys-color-on-surface)',
                      opacity: assigning ? 0.6 : 1,
                    }}
                  >
                    <option value="">— 未割当 —</option>
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
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
                            maxWidth: '72%', padding: msg.messageType === 'image' ? 4 : '10px 14px', borderRadius: isOutbound ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                            background: isFailed ? 'rgba(248,113,113,0.15)' : isOutbound ? '#4f8ef7' : 'var(--md-sys-color-surface-container-high)',
                            color: isFailed ? '#f87171' : isOutbound ? '#ffffff' : 'var(--md-sys-color-on-surface)',
                            fontSize: 14, lineHeight: 1.5,
                            border: isFailed ? '1px solid rgba(248,113,113,0.4)' : 'none',
                            overflow: 'hidden',
                          }}
                        >
                          {msg.messageType === 'image' ? (
                            (() => {
                              const src = msg.imageUrl || `/api/admin/line/messages/${msg.id}/image`
                              return (
                                // eslint-disable-next-line @next/next/no-img-element
                                <a href={src} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                                  <img
                                    src={src}
                                    alt="LINE画像"
                                    style={{ display: 'block', maxWidth: 240, maxHeight: 320, borderRadius: 12, objectFit: 'cover' }}
                                    onError={e => { e.currentTarget.style.display = 'none' }}
                                  />
                                </a>
                              )
                            })()
                          ) : (
                            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                              {msg.content ?? `[${msg.messageType}]`}
                            </div>
                          )}
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
              トークを選択してください
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
