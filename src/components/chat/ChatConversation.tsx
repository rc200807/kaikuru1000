'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatJstDate } from '@/lib/datetime'
import MessageItem from './MessageItem'
import Composer from './Composer'
import ThreadPanel from './ThreadPanel'
import type { ChatAttachment, ChatEndpoints, ChatMessage, Participant } from './types'

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

/** ポーリング間隔の倍率。変化が無いほど後ろへ進む（6s → 15s → 30s → 60s） */
const POLL_BACKOFF = [1, 2.5, 5, 10]

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
  const [participants, setParticipants] = useState<Participant[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const hasLoadedRef = useRef(false)

  // onActivity は毎レンダーで参照が変わりうるため ref 経由で呼ぶ（フェッチ関数を安定させ、
  // ポーリングのたびに loading が true→false して画面がチカチカするのを防ぐ）
  const onActivityRef = useRef(onActivity)
  onActivityRef.current = onActivity

  const messagesUrl = endpoints.messages
  const readUrl = endpoints.read
  const participantsUrl = endpoints.participants

  // メンション候補（本部管理者＋店舗メンバー）を取得
  useEffect(() => {
    let cancelled = false
    fetch(participantsUrl)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return
        const admins: Participant[] = (d.admins ?? []).map((a: { id: string; name: string; avatar?: string | null }) => ({ type: 'admin' as const, id: a.id, name: a.name, avatar: a.avatar ?? null }))
        const members: Participant[] = (d.members ?? []).map((m: { id: string; name: string; avatar?: string | null }) => ({ type: 'store' as const, id: m.id, name: m.name, avatar: m.avatar ?? null }))
        setParticipants([...admins, ...members])
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [participantsUrl])

  // 「今の会話の状態」を表す指紋。変化検知（ポーリング間隔の調整）と
  // 既読POSTを打つかどうかの判定に使う
  const signatureRef = useRef('')
  const readSignatureRef = useRef('')
  // 変化が無い状態が続いたら段階的に間隔を伸ばす（0 が最短）
  const idleStepRef = useRef(0)

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(messagesUrl)
      if (!res.ok) return
      const data = await res.json()
      const list: ChatMessage[] = data.messages ?? []
      setMessages(list)
      setOtherReadAt(data.otherReadAt ?? null)

      const signature = `${list.length}:${list[list.length - 1]?.id ?? ''}:${data.otherReadAt ?? ''}`
      if (signature !== signatureRef.current) idleStepRef.current = 0
      else idleStepRef.current = Math.min(idleStepRef.current + 1, POLL_BACKOFF.length - 1)
      signatureRef.current = signature

      // 既読POSTは会話に変化があったときだけ。
      // 以前は何も変わっていなくてもポーリングのたびに必ず飛んでおり、
      // アイドルのタブ1枚で 6 秒ごとに 2 本（≒1,200 req/時）のリクエストになっていた
      if (!document.hidden && signature !== readSignatureRef.current) {
        readSignatureRef.current = signature
        fetch(readUrl, { method: 'POST' }).then(() => onActivityRef.current?.()).catch(() => {})
      }
    } finally {
      if (!hasLoadedRef.current) {
        hasLoadedRef.current = true
        setLoading(false)
      }
    }
  }, [messagesUrl, readUrl])

  // 初回ロード＋ポーリング（room が変わる＝messagesUrl が変わると再構築）。
  // 日本から1往復 0.3 秒＋毎回 getServerSession が走るので、静かなときは間隔を伸ばし、
  // 動きがあった瞬間・フォーカス・タブ復帰では即座に最短へ戻す。
  useEffect(() => {
    hasLoadedRef.current = false
    setLoading(true)
    setMessages([])
    atBottomRef.current = true
    signatureRef.current = ''
    readSignatureRef.current = ''
    idleStepRef.current = 0

    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = () => {
      if (cancelled) return
      const wait = Math.round(pollMs * POLL_BACKOFF[idleStepRef.current])
      timer = setTimeout(async () => {
        if (!document.hidden) await fetchMessages()
        schedule()
      }, wait)
    }
    const wake = () => {
      if (cancelled || document.hidden) return
      idleStepRef.current = 0
      if (timer) clearTimeout(timer)
      fetchMessages().finally(schedule)
    }

    fetchMessages().finally(schedule)
    window.addEventListener('focus', wake)
    // hidden 中はスキップしているだけだったので、復帰しても次のティックまで最大 pollMs 待っていた
    document.addEventListener('visibilitychange', wake)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      window.removeEventListener('focus', wake)
      document.removeEventListener('visibilitychange', wake)
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
                participants={participants}
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

      <Composer accent={accent} attachmentsEndpoint={endpoints.attachments} participants={participants} onSend={(b, a) => sendMessage(b, a)} />

      {threadParent && (
        <ThreadPanel
          parent={threadParent}
          accent={accent}
          attachmentsEndpoint={endpoints.attachments}
          participants={participants}
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
