'use client'

import { useState } from 'react'
import { formatJstDateTime } from '@/lib/datetime'
import ChatAvatar from './ChatAvatar'
import AttachmentView from './AttachmentView'
import ChatRichInput from './ChatRichInput'
import { sanitizeChatHtml, isEmptyChatHtml } from '@/lib/chat-sanitize'
import { QUICK_EMOJIS, type ChatMessage, type Participant } from './types'

function formatTime(iso: string) {
  return formatJstDateTime(iso, { year: undefined, month: undefined, day: undefined, hour: '2-digit', minute: '2-digit' })
}

// TipTap 由来のHTML（ブロックタグ始まり）か。レガシーの平文メッセージと区別する。
function isHtmlBody(body: string) {
  return /^\s*<(p|ul|ol|blockquote|pre|h[1-6]|div)[\s>]/i.test(body)
}

const AVATAR = 34

function IconButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="chat-icon-btn"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 30,
        height: 30,
        borderRadius: 8,
        color: 'var(--md-sys-color-on-surface-variant)',
        background: 'transparent',
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

export default function MessageItem({
  message,
  accent,
  grouped = false,
  onReact,
  onEdit,
  onDelete,
  onOpenThread,
  showThreadButton = true,
  participants = [],
}: {
  message: ChatMessage
  accent: string
  grouped?: boolean
  onReact: (id: string, emoji: string) => void
  onEdit: (id: string, body: string) => void
  onDelete: (id: string) => void
  onOpenThread?: (message: ChatMessage) => void
  showThreadButton?: boolean
  participants?: Participant[]
}) {
  const [hover, setHover] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body)

  const mine = message.mine
  const submitEdit = () => {
    if (!isEmptyChatHtml(draft) && draft !== message.body) onEdit(message.id, draft)
    setEditing(false)
  }

  // 自分＝アクセントの淡い塗り / 相手＝ニュートラル面
  const bubbleBg = mine
    ? `color-mix(in srgb, ${accent} 16%, var(--md-sys-color-surface))`
    : 'var(--md-sys-color-surface-container-high)'

  const align = mine ? 'flex-end' : 'flex-start'

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPickerOpen(false) }}
      style={{
        display: 'flex',
        gap: 10,
        justifyContent: align,
        padding: grouped ? '1px 4px' : '7px 4px 1px',
        position: 'relative',
      }}
    >
      {/* 相手のアバター（グループ先頭のみ。以降は余白でそろえる） */}
      {!mine && (
        grouped ? (
          <div style={{ width: AVATAR, flexShrink: 0 }} />
        ) : (
          <ChatAvatar name={message.authorName} authorType={message.authorType} accent={accent} avatarUrl={message.authorAvatar} size={AVATAR} />
        )
      )}

      <div style={{ minWidth: 0, maxWidth: '76%', display: 'flex', flexDirection: 'column', alignItems: align }}>
        {/* 名前＋時刻（相手・グループ先頭のみ） */}
        {!grouped && !mine && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '0 4px 3px' }}>
            <span style={{ fontWeight: 600, fontSize: 12.5, color: 'var(--md-sys-color-on-surface)' }}>{message.authorName}</span>
            {message.authorType === 'admin' && (
              <span style={{ fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: accent, color: '#fff' }}>本部</span>
            )}
            <span style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>{formatTime(message.createdAt)}</span>
          </div>
        )}

        {message.isDeleted ? (
          <div
            style={{
              fontSize: 13,
              fontStyle: 'italic',
              color: 'var(--md-sys-color-on-surface-variant)',
              padding: '8px 14px',
              borderRadius: 16,
              background: 'var(--md-sys-color-surface-container)',
            }}
          >
            このメッセージは削除されました
          </div>
        ) : editing ? (
          <div style={{ width: 'min(460px, 76vw)' }}>
            <div style={{
              borderRadius: 12,
              border: `1px solid ${accent}`,
              background: 'var(--md-sys-color-surface-container-lowest)',
              overflow: 'hidden',
            }}>
              <ChatRichInput
                value={draft}
                onChange={setDraft}
                onSubmit={submitEdit}
                participants={participants}
                accent={accent}
                autoFocus
                placeholder="メッセージを編集…"
              />
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 5, justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setEditing(false)} style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>キャンセル</button>
              <button type="button" onClick={submitEdit} style={{ fontSize: 12, color: accent, fontWeight: 700 }}>保存</button>
            </div>
          </div>
        ) : (
          <div
            style={{
              background: bubbleBg,
              color: 'var(--md-sys-color-on-surface)',
              padding: '9px 13px',
              borderRadius: 18,
              borderTopRightRadius: mine && !grouped ? 6 : 18,
              borderTopLeftRadius: !mine && !grouped ? 6 : 18,
              boxShadow: '0 1px 1px rgba(0,0,0,0.05)',
              maxWidth: '100%',
            }}
          >
            {message.body && (
              isHtmlBody(message.body) ? (
                <div style={{ fontSize: 14, lineHeight: 1.5, wordBreak: 'break-word' }}>
                  <div className="chat-html" dangerouslySetInnerHTML={{ __html: sanitizeChatHtml(message.body) }} />
                  {message.isEdited && (
                    <span style={{ fontSize: 10.5, color: 'var(--md-sys-color-on-surface-variant)', marginLeft: 2 }}>（編集済み）</span>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {message.body}
                  {message.isEdited && (
                    <span style={{ fontSize: 10.5, color: 'var(--md-sys-color-on-surface-variant)', marginLeft: 6 }}>（編集済み）</span>
                  )}
                </div>
              )
            )}
            <AttachmentView attachments={message.attachments} />
          </div>
        )}

        {/* リアクション */}
        {!message.isDeleted && message.reactions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5, justifyContent: align }}>
            {message.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                title={r.actors.map((a) => a.name).join(', ')}
                onClick={() => onReact(message.id, r.emoji)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 8px', borderRadius: 999,
                  fontSize: 12.5, lineHeight: 1.7,
                  border: `1px solid ${r.mine ? accent : 'var(--md-sys-color-outline-variant)'}`,
                  background: r.mine ? `color-mix(in srgb, ${accent} 14%, transparent)` : 'var(--md-sys-color-surface-container)',
                  color: 'var(--md-sys-color-on-surface)', cursor: 'pointer',
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
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 5, fontSize: 12, fontWeight: 700, color: accent, cursor: 'pointer' }}
          >
            💬 スレッド {message.replyCount} 件の返信
          </button>
        )}
      </div>

      {/* ホバーアクション（自分は左側 / 相手は右側に浮かせる） */}
      {(hover || pickerOpen) && !editing && !message.isDeleted && (
        <div
          style={{
            position: 'absolute',
            top: grouped ? -6 : 16,
            [mine ? 'right' : 'left']: mine ? 'calc(24% + 8px)' : AVATAR + 18,
            display: 'flex',
            gap: 2,
            padding: 2,
            borderRadius: 9,
            background: 'var(--md-sys-color-surface-container-high)',
            border: '1px solid var(--md-sys-color-outline-variant)',
            boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
            zIndex: 5,
          } as React.CSSProperties}
        >
          <div style={{ position: 'relative' }}>
            <IconButton title="リアクション" onClick={() => setPickerOpen((v) => !v)}>
              <span style={{ fontSize: 16 }}>😊</span>
            </IconButton>
            {pickerOpen && (
              <div
                style={{
                  position: 'absolute', top: 34, right: 0, zIndex: 20, display: 'flex', gap: 2, padding: 4,
                  borderRadius: 12, background: 'var(--md-sys-color-surface-container-highest)',
                  border: '1px solid var(--md-sys-color-outline-variant)', boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
                }}
              >
                {QUICK_EMOJIS.map((e) => (
                  <button key={e} type="button" onClick={() => { onReact(message.id, e); setPickerOpen(false) }} style={{ fontSize: 19, padding: 3, cursor: 'pointer', lineHeight: 1 }}>
                    {e}
                  </button>
                ))}
              </div>
            )}
          </div>
          {showThreadButton && onOpenThread && (
            <IconButton title="スレッドで返信" onClick={() => onOpenThread(message)}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </IconButton>
          )}
          {mine && (
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
