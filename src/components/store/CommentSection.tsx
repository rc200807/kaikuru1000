'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

export type Comment = {
  id: string
  authorType: string
  authorName: string
  body: string
  createdAt: string
  mine: boolean
}

/** 店舗ポータル用のコメント欄（一覧＋投稿＋自分の削除） */
export default function CommentSection({
  comments,
  onAdd,
  onDelete,
  title = 'コメント',
  placeholder = 'コメントを入力…',
}: {
  comments: Comment[]
  onAdd: (body: string) => Promise<void>
  onDelete: (id: string) => void
  title?: string
  placeholder?: string
}) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const submit = async () => {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    try {
      await onAdd(t)
      setText('')
    } catch (e) {
      alert(e instanceof Error ? e.message : '送信に失敗しました')
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">
        {title}（{comments.length}）
      </h3>

      <div className="space-y-3 mb-4">
        {comments.length === 0 && (
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">まだコメントはありません。</p>
        )}
        {comments.map(c => (
          <div key={c.id} className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-[var(--md-sys-color-on-surface-variant)]">{c.authorName?.[0] ?? '?'}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{c.authorName}</span>
                {c.authorType === 'admin' && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[var(--store-primary)] text-white">本部</span>
                )}
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  {format(new Date(c.createdAt), 'M月d日 HH:mm', { locale: ja })}
                </span>
                {c.mine && (
                  <button type="button" onClick={() => { if (confirm('このコメントを削除しますか？')) onDelete(c.id) }} className="text-xs text-[var(--md-sys-color-on-surface-variant)] hover:text-red-600 ml-auto">
                    削除
                  </button>
                )}
              </div>
              <p className="text-sm text-[var(--md-sys-color-on-surface)] whitespace-pre-wrap break-words mt-0.5">{c.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="flex-1 resize-none rounded-xl border border-[var(--md-sys-color-outline)] bg-[var(--md-sys-color-surface-container-lowest)] text-[var(--md-sys-color-on-surface)] px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={submit}
          disabled={sending || !text.trim()}
          className="px-4 py-2 rounded-xl bg-[var(--store-primary)] text-white text-sm font-semibold disabled:opacity-40 whitespace-nowrap"
        >
          {sending ? '送信中' : '送信'}
        </button>
      </div>
    </div>
  )
}
