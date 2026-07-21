'use client'

import MessageItem from './MessageItem'
import Composer from './Composer'
import type { ChatAttachment, ChatMessage, Participant } from './types'

export default function ThreadPanel({
  parent,
  accent,
  attachmentsEndpoint,
  participants = [],
  onClose,
  onReact,
  onEdit,
  onDelete,
  onSendReply,
}: {
  parent: ChatMessage
  accent: string
  attachmentsEndpoint: string
  participants?: Participant[]
  onClose: () => void
  onReact: (id: string, emoji: string) => void
  onEdit: (id: string, body: string) => void
  onDelete: (id: string) => void
  onSendReply: (parentId: string, body: string, attachments: ChatAttachment[]) => Promise<void>
}) {
  const replies = parent.replies ?? []
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: 'min(420px, 100%)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--md-sys-color-surface)',
        borderLeft: '1px solid var(--md-sys-color-outline-variant)',
        boxShadow: '-8px 0 24px rgba(0,0,0,0.18)',
        zIndex: 30,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 14px',
          borderBottom: '1px solid var(--md-sys-color-outline-variant)',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--md-sys-color-on-surface)' }}>スレッド</span>
        <button
          type="button"
          onClick={onClose}
          title="閉じる"
          style={{ fontSize: 20, color: 'var(--md-sys-color-on-surface-variant)', cursor: 'pointer', lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 12px' }}>
        <MessageItem
          message={parent}
          accent={accent}
          participants={participants}
          onReact={onReact}
          onEdit={onEdit}
          onDelete={onDelete}
          showThreadButton={false}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            margin: '8px 4px',
            fontSize: 12,
            color: 'var(--md-sys-color-on-surface-variant)',
          }}
        >
          <span style={{ whiteSpace: 'nowrap' }}>{replies.length} 件の返信</span>
          <span style={{ flex: 1, height: 1, background: 'var(--md-sys-color-outline-variant)' }} />
        </div>
        {replies.map((r) => (
          <MessageItem
            key={r.id}
            message={r}
            accent={accent}
            participants={participants}
            onReact={onReact}
            onEdit={onEdit}
            onDelete={onDelete}
            showThreadButton={false}
          />
        ))}
      </div>

      <Composer
        accent={accent}
        attachmentsEndpoint={attachmentsEndpoint}
        placeholder="スレッドに返信…"
        participants={participants}
        onSend={(body, attachments) => onSendReply(parent.id, body, attachments)}
      />
    </div>
  )
}
