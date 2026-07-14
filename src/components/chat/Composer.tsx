'use client'

import { useRef, useState } from 'react'
import { compressImageIfNeeded } from '@/lib/image-utils'
import type { ChatAttachment } from './types'

type PendingAttachment = ChatAttachment & { uploading?: boolean; localId: string }

export default function Composer({
  accent,
  attachmentsEndpoint,
  placeholder = 'メッセージを入力…',
  onSend,
}: {
  accent: string
  attachmentsEndpoint: string
  placeholder?: string
  onSend: (body: string, attachments: ChatAttachment[]) => Promise<void>
}) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState<PendingAttachment[]>([])
  const [sending, setSending] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const idRef = useRef(0)

  const uploading = pending.some((p) => p.uploading)

  const handleFiles = async (files: FileList | null) => {
    if (!files) return
    for (const file of Array.from(files)) {
      const localId = `f${idRef.current++}`
      const isImage = file.type.startsWith('image/')
      setPending((prev) => [
        ...prev,
        { localId, url: '', name: file.name, mimeType: file.type, size: file.size, kind: isImage ? 'image' : 'file', uploading: true },
      ])
      try {
        const toSend = isImage ? await compressImageIfNeeded(file) : file
        const fd = new FormData()
        fd.append('file', toSend)
        const res = await fetch(attachmentsEndpoint, { method: 'POST', body: fd })
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || 'upload failed')
        setPending((prev) => prev.map((p) => (p.localId === localId ? { ...data.attachment, localId, uploading: false } : p)))
      } catch (e) {
        alert(e instanceof Error ? e.message : 'アップロードに失敗しました')
        setPending((prev) => prev.filter((p) => p.localId !== localId))
      }
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  const removePending = (localId: string) => setPending((prev) => prev.filter((p) => p.localId !== localId))

  const send = async () => {
    const trimmed = text.trim()
    const ready = pending.filter((p) => !p.uploading && p.url)
    if ((!trimmed && ready.length === 0) || sending || uploading) return
    setSending(true)
    try {
      await onSend(
        trimmed,
        ready.map(({ url, name, mimeType, size, kind }) => ({ url, name, mimeType, size, kind })),
      )
      setText('')
      setPending([])
    } catch (e) {
      alert(e instanceof Error ? e.message : '送信に失敗しました')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      style={{
        borderTop: '1px solid var(--md-sys-color-outline-variant)',
        padding: 10,
        background: 'var(--md-sys-color-surface)',
      }}
    >
      {pending.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          {pending.map((p) => (
            <div
              key={p.localId}
              style={{
                position: 'relative',
                borderRadius: 8,
                border: '1px solid var(--md-sys-color-outline-variant)',
                background: 'var(--md-sys-color-surface-container)',
                padding: p.kind === 'image' ? 0 : '6px 24px 6px 10px',
                overflow: 'hidden',
              }}
            >
              {p.kind === 'image' && p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt={p.name} style={{ width: 60, height: 60, objectFit: 'cover', display: 'block', opacity: p.uploading ? 0.5 : 1 }} />
              ) : (
                <span style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface)', opacity: p.uploading ? 0.5 : 1 }}>
                  {p.uploading ? 'アップロード中…' : `📎 ${p.name}`}
                </span>
              )}
              <button
                type="button"
                onClick={() => removePending(p.localId)}
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 2,
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.6)',
                  color: '#fff',
                  fontSize: 12,
                  lineHeight: '18px',
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <button
          type="button"
          title="ファイル・画像を添付"
          onClick={() => fileRef.current?.click()}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 8,
            color: 'var(--md-sys-color-on-surface-variant)',
            flexShrink: 0,
            cursor: 'pointer',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
          style={{ display: 'none' }}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder}
          rows={1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              send()
            }
          }}
          style={{
            flex: 1,
            resize: 'none',
            maxHeight: 160,
            minHeight: 40,
            borderRadius: 10,
            border: '1px solid var(--md-sys-color-outline)',
            background: 'var(--md-sys-color-surface-container-lowest)',
            color: 'var(--md-sys-color-on-surface)',
            padding: '9px 12px',
            fontSize: 14,
            lineHeight: 1.4,
          }}
        />
        <button
          type="button"
          onClick={send}
          disabled={sending || uploading || (!text.trim() && pending.filter((p) => p.url).length === 0)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 8,
            background: accent,
            color: '#fff',
            flexShrink: 0,
            cursor: 'pointer',
            opacity: sending || uploading || (!text.trim() && pending.filter((p) => p.url).length === 0) ? 0.4 : 1,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
