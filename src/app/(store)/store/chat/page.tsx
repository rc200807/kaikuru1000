'use client'

import { useCallback, useMemo } from 'react'
import AppBar from '@/components/AppBar'
import ChatConversation from '@/components/chat/ChatConversation'
import type { ChatEndpoints } from '@/components/chat/types'

export default function StoreChatPage() {
  const onActivity = useCallback(() => window.dispatchEvent(new Event('chat:activity')), [])

  const endpoints: ChatEndpoints = useMemo(
    () => ({
      messages: '/api/store/chat/messages',
      message: (id) => `/api/store/chat/messages/${id}`,
      reactions: (id) => `/api/store/chat/messages/${id}/reactions`,
      read: '/api/store/chat/read',
      attachments: '/api/store/chat/attachments',
      participants: '/api/store/chat/participants',
    }),
    [],
  )

  return (
    // モバイルは下部ナビ(4rem)ぶんを差し引いて全高。デスクトップは下部ナビなしで全高。
    <div className="flex flex-col min-h-0 h-[calc(100dvh-4rem)] md:h-[100dvh]">
      <AppBar title="本部チャット" subtitle="本部とのやり取り" />
      <div className="flex-1 min-h-0">
        <ChatConversation
          endpoints={endpoints}
          accent="var(--store-primary)"
          emptyHint="本部とのチャットです。ご質問・ご連絡をこちらからどうぞ。"
          onActivity={onActivity}
        />
      </div>
    </div>
  )
}
