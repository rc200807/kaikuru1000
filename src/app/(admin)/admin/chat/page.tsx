'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatJstDateTime } from '@/lib/datetime'
import ChatConversation from '@/components/chat/ChatConversation'
import type { ChatEndpoints } from '@/components/chat/types'

const ACCENT = '#4f8ef7'

type RoomListItem = {
  storeId: string
  storeName: string
  storeCode: string
  roomId: string | null
  lastMessageAt: string | null
  lastMessagePreview: string | null
  unreadCount: number
}

function formatWhen(iso: string | null): string {
  if (!iso) return ''
  return formatJstDateTime(iso, { year: undefined, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function AdminChatPage() {
  const [rooms, setRooms] = useState<RoomListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)

  const fetchRooms = useCallback(async (q: string) => {
    try {
      const res = await fetch(`/api/admin/chat/rooms${q ? `?search=${encodeURIComponent(q)}` : ''}`)
      if (!res.ok) return
      const data = await res.json()
      setRooms(data.rooms ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  // 検索デバウンス
  useEffect(() => {
    const t = setTimeout(() => fetchRooms(search), 250)
    return () => clearTimeout(t)
  }, [search, fetchRooms])

  // ポーリング＋フォーカス更新
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) fetchRooms(search)
    }, 8000)
    const onFocus = () => fetchRooms(search)
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [fetchRooms, search])

  const handleActivity = useCallback(() => {
    fetchRooms(search)
    window.dispatchEvent(new Event('chat:activity'))
  }, [fetchRooms, search])

  const selected = rooms.find((r) => r.storeId === selectedStoreId) ?? null

  const endpoints: ChatEndpoints | null = useMemo(() => {
    if (!selectedStoreId) return null
    return {
      messages: `/api/admin/chat/rooms/${selectedStoreId}/messages`,
      message: (id) => `/api/admin/chat/rooms/${selectedStoreId}/messages/${id}`,
      reactions: (id) => `/api/admin/chat/rooms/${selectedStoreId}/messages/${id}/reactions`,
      read: `/api/admin/chat/rooms/${selectedStoreId}/read`,
      attachments: `/api/admin/chat/attachments`,
      participants: `/api/admin/chat/rooms/${selectedStoreId}/participants`,
    }
  }, [selectedStoreId])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--appbar-h))' }}>
      {/* ヘッダー */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--md-sys-color-outline-variant)',
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--md-sys-color-on-surface)' }}>店舗チャット</h1>
        <p style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)', marginTop: 2 }}>
          各店舗と本部のチャット。左のリストから店舗を選択してください。
        </p>
      </div>

      {/* 分割レイアウト */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(280px, 360px) 1fr', overflow: 'hidden', minHeight: 0 }}>
        {/* 左: 店舗ルーム一覧 */}
        <aside
          style={{
            borderRight: '1px solid var(--md-sys-color-outline-variant)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div style={{ padding: 12, borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="店舗名・コードで検索"
              style={{
                width: '100%',
                height: 38,
                borderRadius: 999,
                border: '1px solid var(--md-sys-color-outline)',
                background: 'var(--md-sys-color-surface-container-lowest)',
                color: 'var(--md-sys-color-on-surface)',
                padding: '0 14px',
                fontSize: 13,
              }}
            />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)', fontSize: 13 }}>
                読み込み中…
              </div>
            ) : rooms.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)', fontSize: 13 }}>
                店舗が見つかりません
              </div>
            ) : (
              rooms.map((r) => {
                const isActive = r.storeId === selectedStoreId
                return (
                  <button
                    key={r.storeId}
                    type="button"
                    onClick={() => setSelectedStoreId(r.storeId)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--md-sys-color-outline-variant)',
                      borderLeft: isActive ? `3px solid ${ACCENT}` : '3px solid transparent',
                      background: isActive ? 'rgba(79,142,247,0.10)' : 'transparent',
                      cursor: 'pointer',
                      display: 'block',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 13,
                          color: 'var(--md-sys-color-on-surface)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {r.storeName}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {r.lastMessageAt && (
                          <span style={{ fontSize: 10, color: 'var(--md-sys-color-on-surface-variant)' }}>
                            {formatWhen(r.lastMessageAt)}
                          </span>
                        )}
                        {r.unreadCount > 0 && (
                          <span
                            style={{
                              minWidth: 18,
                              height: 18,
                              padding: '0 5px',
                              borderRadius: 999,
                              background: '#dc2626',
                              color: '#fff',
                              fontSize: 11,
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {r.unreadCount > 99 ? '99+' : r.unreadCount}
                          </span>
                        )}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--md-sys-color-on-surface-variant)',
                        marginTop: 2,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {r.lastMessagePreview || 'メッセージはまだありません'}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        {/* 右: 会話 */}
        <main style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
          {selected && endpoints ? (
            <>
              <div
                style={{
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--md-sys-color-outline-variant)',
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--md-sys-color-on-surface)' }}>{selected.storeName}</span>
                <span style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>{selected.storeCode}</span>
              </div>
              <div style={{ flex: 1, minHeight: 0 }}>
                <ChatConversation
                  key={selected.storeId}
                  endpoints={endpoints}
                  accent={ACCENT}
                  emptyHint={`${selected.storeName}とのチャットです。メッセージを送ってみましょう。`}
                  onActivity={handleActivity}
                />
              </div>
            </>
          ) : (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--md-sys-color-on-surface-variant)',
                fontSize: 14,
              }}
            >
              左のリストから店舗を選択してください
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
