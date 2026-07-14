'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import MessageItem from './MessageItem'
import Composer from './Composer'
import ThreadPanel from './ThreadPanel'
import type { ChatAttachment, ChatEndpoints, ChatMessage } from './types'

export default function ChatConversation({
  endpoints,
  accent,
  pollMs = 6000,
  emptyHint = 'まだメッセージはありません。最初のメッセージを送ってみましょう。',
  onActivity,
}: {
  endpoints: ChatEndpoints
  accent: string
  pollMs?: number
  emptyHint?: string
  /** 送受信・既読でナビの未読バッジ更新を促すコールバック */
  onActivity?: () => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [threadId, setThreadId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)

  const markRead = useCallback(async () => {
    try {
      await fetch(endpoints.read, { method: 'POST' })
      onActivity?.()
    } catch { /* noop */ }
  }, [endpoints.read, onActivity])

  const fetchMessages = useCallback(async (opts: { markReadAfter?: boolean } = {}) => {
    try {
      const res = await fetch(endpoints.messages)
      if (!res.ok) return
      const data = await res.json()
      setMessages(data.messages ?? [])
      setOtherReadAt(data.otherReadAt ?? null)
      if (opts.markReadAfter && !document.hidden) markRead()
    } finally {
      setLoading(false)
    }
  }, [endpoints.messages, markRead])

  // 初回ロード＋既読化
  useEffect(() => {
    setLoading(true)
    fetchMessages({ markReadAfter: true })
  }, [fetchMessages])

  // ポーリング＋フォーカス更新
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) fetchMessages({ markReadAfter: true })
    }, pollMs)
    const onFocus = () => fetchMessages({ markReadAfter: true })
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [fetchMessages, pollMs])

  // 自動スクロール（下端付近にいるときのみ）
  useEffect(() => {
    const el = scrollRef.current
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  const sendMessage = useCallback(
    async (body: string, attachments: ChatAttachment[], parentId?: string) => {
      atBottomRef.current = true
      const res = await fetch(endpoints.messages, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, attachments, parentId: parentId ?? null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || '送信に失敗しました')
      }
      await fetchMessages()
      onActivity?.()
    },
    [endpoints.messages, fetchMessages, onActivity],
  )

  const editMessage = useCallback(
    async (id: string, body: string) => {
      await fetch(endpoints.message(id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      fetchMessages()
    },
    [endpoints, fetchMessages],
  )

  const deleteMessage = useCallback(
    async (id: string) => {
      await fetch(endpoints.message(id), { method: 'DELETE' })
      fetchMessages()
    },
    [endpoints, fetchMessages],
  )

  const toggleReaction = useCallback(
    async (id: string, emoji: string) => {
      await fetch(endpoints.reactions(id), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emoji }),
      })
      fetchMessages()
    },
    [endpoints, fetchMessages],
  )

  const threadParent = threadId ? messages.find((m) => m.id === threadId) ?? null : null

  // 既読表示：自分の最後のメッセージが相手に読まれているか
  const myMessages = messages.filter((m) => m.mine && !m.isDeleted)
  const lastMine = myMessages[myMessages.length - 1]
  const showRead = !!(lastMine && otherReadAt && new Date(otherReadAt) >= new Date(lastMine.createdAt))

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', padding: '12px 10px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--md-sys-color-on-surface-variant)', fontSize: 13 }}>
            読み込み中…
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--md-sys-color-on-surface-variant)', fontSize: 13 }}>
            {emptyHint}
          </div>
        ) : (
          messages.map((m) => (
            <MessageItem
              key={m.id}
              message={m}
              accent={accent}
              onReact={toggleReaction}
              onEdit={editMessage}
              onDelete={deleteMessage}
              onOpenThread={(msg) => setThreadId(msg.id)}
            />
          ))
        )}
        {showRead && (
          <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', padding: '2px 6px' }}>
            既読
          </div>
        )}
      </div>

      <Composer accent={accent} attachmentsEndpoint={endpoints.attachments} onSend={(b, a) => sendMessage(b, a)} />

      {threadParent && (
        <ThreadPanel
          parent={threadParent}
          accent={accent}
          attachmentsEndpoint={endpoints.attachments}
          onClose={() => setThreadId(null)}
          onReact={toggleReaction}
          onEdit={editMessage}
          onDelete={deleteMessage}
          onSendReply={(parentId, body, attachments) => sendMessage(body, attachments, parentId)}
        />
      )}
    </div>
  )
}
