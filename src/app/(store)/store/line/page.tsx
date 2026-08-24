'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import AppBar from '@/components/AppBar'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useStoreScope } from '@/components/store/StoreScopeContext'

type LastMessage = {
  content: string | null
  sentAt: string
  direction: string
  messageType: string
}

type TalkUser = {
  id: string
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

export default function StoreLinePage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const scope = useStoreScope()
  const [users, setUsers] = useState<TalkUser[]>([])
  const [isMulti, setIsMulti] = useState(false)
  const [storeCode, setStoreCode] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showQr, setShowQr] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (authStatus === 'unauthenticated') router.push('/store/login')
  }, [authStatus, router])

  const scopeQuery = scope.scopeQuery

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`/api/store/line/users${scopeQuery ? `?${scopeQuery}` : ''}`)
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users ?? [])
        setIsMulti(!!data.isMulti)
        setStoreCode(data.storeCode ?? '')
      }
    } finally {
      setLoading(false)
    }
  }, [scopeQuery])

  useEffect(() => {
    if (authStatus === 'authenticated' && !scope.loading) fetchUsers()
  }, [authStatus, scope.loading, fetchUsers])

  const selectedUser = users.find((u) => u.id === selectedUserId) ?? null

  const fetchMessages = useCallback(async (userId: string) => {
    setLoadingMessages(true)
    try {
      const res = await fetch(`/api/store/line/users/${userId}/messages${scopeQuery ? `?${scopeQuery}` : ''}`)
      if (res.ok) {
        setMessages(await res.json())
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, unreadCount: 0 } : u)))
      }
    } finally {
      setLoadingMessages(false)
    }
  }, [scopeQuery])

  useEffect(() => {
    if (selectedUserId) fetchMessages(selectedUserId)
  }, [selectedUserId, fetchMessages])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    if (!replyText.trim() || !selectedUserId || sending) return
    setSending(true)
    setSendError('')
    try {
      const res = await fetch(`/api/store/line/users/${selectedUserId}/reply${scopeQuery ? `?${scopeQuery}` : ''}`, {
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

  function formatTime(iso: string) {
    const d = new Date(iso)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (isToday) return d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
  }

  if (authStatus === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage />
  }

  const registerUrl = storeCode ? `https://system.rcinc.jp/line/${storeCode}` : ''

  function handleCopyUrl() {
    if (!registerUrl) return
    navigator.clipboard.writeText(registerUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 56px)' }}>
      <AppBar title="LINEトーク" />

      {/* LINE登録URL + QRコード */}
      {registerUrl && (
        <div className="px-4 sm:px-6 pt-3">
          <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] px-4 py-3 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-[var(--md-sys-color-on-surface-variant)]">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
              <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">LINE友だち登録フォーム</p>
            </div>
            <div className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-[var(--md-sys-color-surface-container)] border border-[var(--md-sys-color-outline-variant)]">
              <p className="text-xs text-[var(--md-sys-color-on-surface)] truncate font-mono">{registerUrl}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleCopyUrl}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--store-primary)] text-[var(--store-on-primary)] hover:opacity-90 transition-opacity"
              >
                {copied ? '✓ コピー済み' : 'URLをコピー'}
              </button>
              <button
                onClick={() => setShowQr((v) => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)] transition-colors"
              >
                {showQr ? 'QRを閉じる' : 'QRコード'}
              </button>
            </div>
            {showQr && (
              <div className="w-full flex justify-center py-3">
                <div className="bg-white p-3 rounded-xl">
                  <QRCodeSVG value={registerUrl} size={160} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* トーク本体 */}
      <div className="flex-1 min-h-0 px-4 sm:px-6 py-3">
        <div className="h-full grid grid-cols-1 md:grid-cols-[300px_1fr] gap-3">

          {/* ユーザー一覧（モバイルは選択時に非表示） */}
          <div className={`${selectedUserId ? 'hidden md:flex' : 'flex'} flex-col rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] overflow-hidden`}>
            <div className="px-4 py-3 border-b border-[var(--md-sys-color-outline-variant)] flex items-center justify-between shrink-0">
              <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">トーク</p>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{users.length}人</p>
            </div>
            <div className="flex-1 overflow-y-auto">
              {users.length === 0 ? (
                <p className="p-4 text-xs text-center text-[var(--md-sys-color-on-surface-variant)]">
                  LINE登録された顧客がまだいません。
                  <br />
                  上のURLやQRコードから登録をご案内ください
                </p>
              ) : (
                users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUserId(u.id)}
                    className={`w-full text-left px-4 py-3 border-b border-[var(--md-sys-color-outline-variant)] transition-colors ${
                      selectedUserId === u.id ? 'bg-[var(--md-sys-color-surface-container)]' : 'hover:bg-[var(--md-sys-color-surface-container-low)]'
                    } ${u.isFollowing ? '' : 'opacity-55'}`}
                  >
                    <div className="flex items-center gap-2.5">
                      {u.pictureUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" decoding="async" src={u.pictureUrl} alt="" referrerPolicy="no-referrer" className="w-9 h-9 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-center shrink-0">👤</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm truncate text-[var(--md-sys-color-on-surface)] ${u.unreadCount > 0 ? 'font-bold' : ''}`}>
                            {u.linkedUser?.name ?? u.displayName}
                          </p>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {u.unreadCount > 0 && (
                              <span className="bg-[var(--md-sys-color-error)] text-white rounded-full px-1.5 py-0.5 text-[10px] font-bold">
                                {u.unreadCount}
                              </span>
                            )}
                            {u.lastMessage && (
                              <span className="text-[10px] text-[var(--md-sys-color-on-surface-variant)]">
                                {formatTime(u.lastMessage.sentAt)}
                              </span>
                            )}
                          </div>
                        </div>
                        {isMulti && u.store && (
                          <span className="inline-block text-[10px] font-semibold text-[var(--store-primary)] bg-[var(--md-sys-color-surface-container)] rounded-full px-2 py-0.5 my-0.5 max-w-[140px] truncate">
                            {u.store.name}
                          </span>
                        )}
                        <p className="text-xs truncate text-[var(--md-sys-color-on-surface-variant)]">
                          {u.lastMessage ? (u.lastMessage.content ?? `[${u.lastMessage.messageType}]`) : '— メッセージなし —'}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* 会話ペイン */}
          <div className={`${selectedUserId ? 'flex' : 'hidden md:flex'} flex-col rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface)] overflow-hidden`}>
            {selectedUser ? (
              <>
                {/* ヘッダー */}
                <div className="px-4 py-3 border-b border-[var(--md-sys-color-outline-variant)] flex items-center gap-2.5 shrink-0">
                  <button
                    onClick={() => setSelectedUserId(null)}
                    className="md:hidden shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]"
                    aria-label="戻る"
                  >
                    ←
                  </button>
                  {selectedUser.pictureUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img loading="lazy" decoding="async" src={selectedUser.pictureUrl} alt="" referrerPolicy="no-referrer" className="w-8 h-8 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-center shrink-0">👤</div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-bold truncate text-[var(--md-sys-color-on-surface)]">
                      {selectedUser.linkedUser?.name ?? selectedUser.displayName}
                    </p>
                    <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate">
                      {selectedUser.linkedUser
                        ? `LINE: ${selectedUser.displayName}${selectedUser.linkedUser.phone ? ` ／ ${selectedUser.linkedUser.phone}` : ''}`
                        : '顧客未紐付け'}
                    </p>
                  </div>
                  {selectedUser.linkedUser && (
                    <a
                      href={`/store/customers/${selectedUser.linkedUser.id}`}
                      className="ml-auto shrink-0 text-xs px-3 py-1.5 rounded-lg border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container)] transition-colors"
                    >
                      顧客情報
                    </a>
                  )}
                </div>

                {/* メッセージ一覧 */}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2.5">
                  {loadingMessages ? (
                    <div className="flex justify-center pt-10"><LoadingSpinner /></div>
                  ) : messages.length === 0 ? (
                    <p className="text-center text-xs text-[var(--md-sys-color-on-surface-variant)]">メッセージがありません</p>
                  ) : (
                    messages.map((msg) => {
                      const isOutbound = msg.direction === 'outbound'
                      const isFailed = msg.status === 'failed'
                      return (
                        <div key={msg.id} className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}>
                          <div
                            className={`max-w-[78%] text-sm leading-relaxed overflow-hidden ${
                              msg.messageType === 'image' ? 'p-1' : 'px-3.5 py-2.5'
                            } ${
                              isFailed
                                ? 'bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-300 border border-red-300 dark:border-red-800'
                                : isOutbound
                                  ? 'bg-[var(--store-primary)] text-[var(--store-on-primary)]'
                                  : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]'
                            }`}
                            style={{ borderRadius: isOutbound ? '16px 4px 16px 16px' : '4px 16px 16px 16px' }}
                          >
                            {msg.messageType === 'image' && msg.imageUrl ? (
                              <a href={msg.imageUrl} target="_blank" rel="noopener noreferrer" className="block">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img loading="lazy" decoding="async" src={msg.imageUrl} alt="LINE画像" className="block max-w-[240px] max-h-[320px] rounded-xl object-cover" />
                              </a>
                            ) : (
                              <p className="whitespace-pre-wrap break-words">
                                {msg.content ?? `[${msg.messageType}]`}
                              </p>
                            )}
                            <p className={`text-[10px] mt-1 opacity-70 flex items-center gap-1.5 ${isOutbound ? 'justify-end' : ''}`}>
                              {isFailed && <span className="text-red-500 opacity-100">送信失敗</span>}
                              {new Date(msg.sentAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                      )
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* 返信入力 */}
                <div className="border-t border-[var(--md-sys-color-outline-variant)] p-3 flex flex-col gap-2 shrink-0">
                  {sendError && (
                    <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-2 rounded-lg">⚠ {sendError}</p>
                  )}
                  <div className="flex gap-2">
                    <textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                      }}
                      placeholder="返信を入力（Enter で送信 / Shift+Enter で改行）"
                      rows={2}
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-sm text-[var(--md-sys-color-on-surface)] resize-none"
                    />
                    <button
                      onClick={handleSend}
                      disabled={sending || !replyText.trim()}
                      className="px-5 rounded-xl font-bold text-sm bg-[var(--store-primary)] text-[var(--store-on-primary)] disabled:opacity-50"
                    >
                      {sending ? '...' : '送信'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
                トークを選択してください
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
