'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatJstDate } from '@/lib/datetime'
import MessageItem from './MessageItem'
import Composer from './Composer'
import ThreadPanel from './ThreadPanel'
import type { ChatAttachment, ChatEndpoints, ChatMessage } from './types'

const TOKYO_TZ = 'Asia/Tokyo'
function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TOKYO_TZ })
}
function dateLabel(iso: string) {
  const key = dayKey(iso)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: TOKYO_TZ })
  const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: TOKYO_TZ })
  if (key === today) return '今日'
  if (key === yesterday) return '昨日'
  return formatJstDate(iso, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
}

type RenderItem =
  | { kind: 'date'; id: string; label: string }
  | { kind: 'msg'; id: string; message: ChatMessage; grouped: boolean }

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
  onActivity?: () => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [threadId, setThreadId] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const hasLoadedRef = useRef(false)

  // onActivity は毎レンダーで参照が変わりうるため ref 経由で呼ぶ（フェッチ関数を安定させ、
  // ポーリングのたびに loading が true→false して画面がチカチカするのを防ぐ）
  const onActivityRef = useRef(onActivity)
  onActivityRef.current = onActivity

  const messagesUrl = endpoints.messages
  const readUrl = endpoints.read

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(messagesUrl)
      if (!res.ok) return
      const data = await res.json()
      setMessages(data.messages ?? [])
      setOtherReadAt(data.otherReadAt ?? null)
      if (!document.hidden) {
        fetch(readUrl, { method: 'POST' }).then(() => onActivityRef.current?.()).catch(() => {})
      }
    } finally {
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true
        setLoading(false)
      }
    }
  }, [messagesUrl, readUrl])

  // 初回ロード＋ポーリング＋フォーカス更新（room が変わる＝messagesUrl が変わると再構築）
  useEffect(() => {
    hasLoadedRef.current = false
    setLoading(true)
    setMessages([])
    atBottomRef.current = true
    fetchMessages()
    const timer = setInterval(() => { if (!document.hidden) fetchMessages() }, pollMs)
    const onFocus = () => fetchMessages()
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
      const res = await fetch(messagesUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, attachments, parentId: parentId ?? null }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || '送信に失敗しました')
      }
      await fetchMessages()
      onActivityRef.current?.()
    },
    [messagesUrl, fetchMessages],
  )

  const editMessage = useCallback(async (id: string, body: string) => {
    await fetch(endpoints.message(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }) })
    fetchMessages()
  }, [endpoints, fetchMessages])

  const deleteMessage = useCallback(async (id: string) => {
    await fetch(endpoints.message(id), { method: 'DELETE' })
    fetchMessages()
  }, [endpoints, fetchMessages])

  const toggleReaction = useCallback(async (id: string, emoji: string) => {
    await fetch(endpoints.reactions(id), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ emoji }) })
    fetchMessages()
  }, [endpoints, fetchMessages])

  const threadParent = threadId ? messages.find((m) => m.id === threadId) ?? null : null

  // 既読表示：自分の最後のメッセージが相手に読まれているか
  const myMessages = messages.filter((m) => m.mine && !m.isDeleted)
  const lastMine = myMessages[myMessages.length - 1]
  const showRead = !!(lastMine && otherReadAt && new Date(otherReadAt) >= new Date(lastMine.createdAt))

  // 日付区切り＋連続グループ化を計算
  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = []
    let prev: ChatMessage | null = null
    for (const m of messages) {
      const newDay = !prev || dayKey(prev.createdAt) !== dayKey(m.createdAt)
      if (newDay) items.push({ kind: 'date', id: `d-${m.id}`, label: dateLabel(m.createdAt) })
      const grouped =
        !newDay && !!prev &&
        prev.authorType === m.authorType &&
        prev.authorName === m.authorName &&
        prev.mine === m.mine &&
        new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60 * 1000
      items.push({ kind: 'msg', id: m.id, message: m, grouped })
      prev = m
    }
    return items
  }, [messages])

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: 'var(--md-sys-color-surface)' }}>
      <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', padding: '10px 12px 4px' }}>
        {loading ? (
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--md-sys-color-on-surface-variant)', fontSize: 13 }}>
            読み込み中…
          </div>
        ) : messages.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--md-sys-color-on-surface-variant)', textAlign: 'center', padding: 20 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: `color-mix(in srgb, ${accent} 14%, var(--md-sys-color-surface))`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>💬</div>
            <div style={{ fontSize: 13, maxWidth: 320 }}>{emptyHint}</div>
          </div>
        ) : (
          renderItems.map((it) =>
            it.kind === 'date' ? (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 8px 8px' }}>
                <span style={{ flex: 1, height: 1, background: 'var(--md-sys-color-outline-variant)' }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--md-sys-color-on-surface-variant)', background: 'var(--md-sys-color-surface-container)', padding: '3px 12px', borderRadius: 999 }}>{it.label}</span>
                <span style={{ flex: 1, height: 1, background: 'var(--md-sys-color-outline-variant)' }} />
              </div>
            ) : (
              <MessageItem
                key={it.id}
                message={it.message}
                accent={accent}
                grouped={it.grouped}
                onReact={toggleReaction}
                onEdit={editMessage}
                onDelete={deleteMessage}
                onOpenThread={(msg) => setThreadId(msg.id)}
              />
            ),
          )
        )}
        {showRead && (
          <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', padding: '2px 8px 4px' }}>既読</div>
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
