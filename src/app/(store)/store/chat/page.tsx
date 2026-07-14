'use client'

import { useMemo } from 'react'
import AppBar from '@/components/AppBar'
import ChatConversation from '@/components/chat/ChatConversation'
import type { ChatEndpoints } from '@/components/chat/types'

export default function StoreChatPage() {
  const endpoints: ChatEndpoints = useMemo(
    () => ({
      messages: '/api/store/chat/messages',
      message: (id) => `/api/store/chat/messages/${id}`,
      reactions: (id) => `/api/store/chat/messages/${id}/reactions`,
      read: '/api/store/chat/read',
      attachments: '/api/store/chat/attachments',
    }),
    [],
  )

  return (
    <div className="flex flex-col h-full min-h-0">
      <AppBar title="本部チャット" subtitle="本部とのやり取り" />
      <div className="flex-1 min-h-0">
        <ChatConversation
          endpoints={endpoints}
          accent="var(--store-primary)"
          emptyHint="本部とのチャットです。ご質問・ご連絡をこちらからどうぞ。"
          onActivity={() => window.dispatchEvent(new Event('chat:activity'))}
        />
      </div>
    </div>
  )
}
