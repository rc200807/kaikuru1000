'use client'

import { useState } from 'react'
import { formatJstDateTime } from '@/lib/datetime'
import ChatAvatar from './ChatAvatar'
import AttachmentView from './AttachmentView'
import { QUICK_EMOJIS, type ChatMessage } from './types'

function formatTime(iso: string) {
  return formatJstDateTime(iso, { year: undefined, month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 28,
        height: 28,
        borderRadius: 6,
        color: 'var(--md-sys-color-on-surface-variant)',
        background: 'transparent',
        cursor: 'pointer',
      }}
      className="chat-icon-btn"
    >
      {children}
    </button>
  )
}

export default function MessageItem({
  message,
  accent,
  onReact,
  onEdit,
  onDelete,
  onOpenThread,
  showThreadButton = true,
}: {
  message: ChatMessage
  accent: string
  onReact: (id: string, emoji: string) => void
  onEdit: (id: string, body: string) => void
  onDelete: (id: string) => void
  onOpenThread?: (message: ChatMessage) => void
  showThreadButton?: boolean
}) {
  const [hover, setHover] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body)

  const submitEdit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== message.body) onEdit(message.id, trimmed)
    setEditing(false)
  }

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPickerOpen(false) }}
      style={{ display: 'flex', gap: 10, padding: '6px 4px', position: 'relative', borderRadius: 8 }}
    >
      <ChatAvatar name={message.authorName} authorType={message.authorType} accent={accent} />

      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--md-sys-color-on-surface)' }}>
            {message.authorName}
          </span>
          {message.authorType === 'admin' && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 999,
                background: accent,
                color: '#fff',
              }}
            >
              本部
            </span>
          )}
          <span style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>
            {formatTime(message.createdAt)}
            {message.isEdited && !message.isDeleted ? '（編集済み）' : ''}
          </span>
        </div>

        {message.isDeleted ? (
          <div style={{ fontSize: 13, fontStyle: 'italic', color: 'var(--md-sys-color-on-surface-variant)', marginTop: 2 }}>
            このメッセージは削除されました
          </div>
        ) : editing ? (
          <div style={{ marginTop: 4 }}>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitEdit()
                if (e.key === 'Escape') setEditing(false)
              }}
              style={{
                width: '100%',
                resize: 'vertical',
                borderRadius: 8,
                border: '1px solid var(--md-sys-color-outline)',
                background: 'var(--md-sys-color-surface-container-lowest)',
                color: 'var(--md-sys-color-on-surface)',
                padding: '8px 10px',
                fontSize: 13,
              }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <button type="button" onClick={submitEdit} style={{ fontSize: 12, color: accent, fontWeight: 700 }}>
                保存
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}
              >
                キャンセル
              </button>
            </div>
          </div>
        ) : (
          <>
            {message.body && (
              <div
                style={{
                  fontSize: 14,
                  color: 'var(--md-sys-color-on-surface)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  marginTop: 2,
                }}
              >
                {message.body}
              </div>
            )}
            <AttachmentView attachments={message.attachments} />
          </>
        )}

        {/* リアクション */}
        {!message.isDeleted && message.reactions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                title={r.actors.map((a) => a.name).join(', ')}
                onClick={() => onReact(message.id, r.emoji)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '1px 8px',
                  borderRadius: 999,
                  fontSize: 12,
                  border: `1px solid ${r.mine ? accent : 'var(--md-sys-color-outline-variant)'}`,
                  background: r.mine ? 'color-mix(in srgb, ' + accent + ' 14%, transparent)' : 'var(--md-sys-color-surface-container)',
                  color: 'var(--md-sys-color-on-surface)',
                  cursor: 'pointer',
                }}
              >
                <span>{r.emoji}</span>
                <span style={{ fontWeight: 600 }}>{r.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* スレッド返信数 */}
        {showThreadButton && !message.isDeleted && (message.replyCount ?? 0) > 0 && onOpenThread && (
          <button
            type="button"
            onClick={() => onOpenThread(message)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginTop: 6,
              fontSize: 12,
              fontWeight: 700,
              color: accent,
              cursor: 'pointer',
            }}
          >
            💬 スレッド {message.replyCount} 件の返信
          </button>
        )}
      </div>

      {/* ホバー時アクション */}
      {(hover || pickerOpen) && !editing && !message.isDeleted && (
        <div
          style={{
            position: 'absolute',
            top: -12,
            right: 8,
            display: 'flex',
            gap: 2,
            padding: 2,
            borderRadius: 8,
            background: 'var(--md-sys-color-surface-container-high)',
            border: '1px solid var(--md-sys-color-outline-variant)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          }}
        >
          <div style={{ position: 'relative' }}>
            <IconButton title="リアクション" onClick={() => setPickerOpen((v) => !v)}>
              <span style={{ fontSize: 15 }}>😊</span>
            </IconButton>
            {pickerOpen && (
              <div
                style={{
                  position: 'absolute',
                  top: 32,
                  right: 0,
                  zIndex: 20,
                  display: 'flex',
                  gap: 2,
                  padding: 4,
                  borderRadius: 10,
                  background: 'var(--md-sys-color-surface-container-highest)',
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                }}
              >
                {QUICK_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => { onReact(message.id, e); setPickerOpen(false) }}
                    style={{ fontSize: 18, padding: 2, cursor: 'pointer', lineHeight: 1 }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          {showThreadButton && onOpenThread && (
            <IconButton title="スレッドで返信" onClick={() => onOpenThread(message)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </IconButton>
          )}
          {message.mine && (
            <>
              <IconButton title="編集" onClick={() => { setDraft(message.body); setEditing(true) }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
                </svg>
              </IconButton>
              <IconButton title="削除" onClick={() => { if (confirm('このメッセージを削除しますか？')) onDelete(message.id) }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                </svg>
              </IconButton>
            </>
          )}
        </div>
      )}
    </div>
  )
}
