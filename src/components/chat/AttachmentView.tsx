'use client'

import { useEffect, useState } from 'react'
import type { ChatAttachment } from './types'

function formatSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function isPdf(a: ChatAttachment) {
  return a.mimeType === 'application/pdf' || a.name.toLowerCase().endsWith('.pdf')
}
/** モーダルでプレビュー可能か（画像・PDF） */
function isPreviewable(a: ChatAttachment) {
  return a.kind === 'image' || isPdf(a)
}

function FileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

/** 添付プレビューモーダル（画像=ライトボックス / PDF=iframe / その他=ダウンロード導線） */
function PreviewModal({ attachment, onClose }: { attachment: ChatAttachment; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const pdf = isPdf(attachment)
  const image = attachment.kind === 'image'

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.8)',
        display: 'flex', flexDirection: 'column', padding: 16,
      }}
    >
      {/* ヘッダー */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#fff', padding: '4px 4px 12px', flexShrink: 0 }}
      >
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {attachment.name}
        </span>
        <a
          href={attachment.url}
          target="_blank"
          rel="noopener noreferrer"
          download={attachment.name}
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#fff', fontSize: 13, textDecoration: 'none', padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.15)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          ダウンロード
        </a>
        <button
          type="button"
          onClick={onClose}
          title="閉じる"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.15)', color: '#fff', cursor: 'pointer', fontSize: 22, lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      {/* 本体 */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={attachment.url} alt={attachment.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
        ) : pdf ? (
          <iframe src={attachment.url} title={attachment.name} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8, background: '#fff' }} />
        ) : (
          <div style={{ textAlign: 'center', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, background: 'rgba(255,255,255,0.08)', padding: 32, borderRadius: 12 }}>
            <div style={{ fontSize: 40 }}>📄</div>
            <div style={{ fontSize: 14 }}>このファイルはプレビューできません</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{formatSize(attachment.size)}</div>
            <a
              href={attachment.url}
              target="_blank"
              rel="noopener noreferrer"
              download={attachment.name}
              style={{ marginTop: 4, padding: '8px 18px', borderRadius: 8, background: '#fff', color: '#111', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
            >
              ダウンロードして開く
            </a>
          </div>
        )}
      </div>
    </div>
  )
}

/** メッセージ内の添付表示（クリックでモーダルプレビュー） */
export default function AttachmentView({ attachments }: { attachments: ChatAttachment[] }) {
  const [preview, setPreview] = useState<ChatAttachment | null>(null)

  if (!attachments || attachments.length === 0) return null
  const images = attachments.filter((a) => a.kind === 'image')
  const files = attachments.filter((a) => a.kind !== 'image')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
      {images.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: images.length === 1 ? '1fr' : 'repeat(2, minmax(0, 1fr))',
            gap: 6,
            maxWidth: 320,
          }}
        >
          {images.map((img, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPreview(img)}
              style={{ display: 'block', padding: 0, border: 'none', background: 'transparent', cursor: 'zoom-in' }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.name}
                style={{
                  width: '100%',
                  maxHeight: 220,
                  objectFit: 'cover',
                  borderRadius: 10,
                  border: '1px solid var(--md-sys-color-outline-variant)',
                  display: 'block',
                }}
              />
            </button>
          ))}
        </div>
      )}
      {files.map((f, i) => (
        <button
          key={i}
          type="button"
          onClick={() => setPreview(f)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid var(--md-sys-color-outline-variant)',
            background: 'var(--md-sys-color-surface-container-lowest)',
            color: 'var(--md-sys-color-on-surface)',
            textAlign: 'left',
            cursor: 'pointer',
            maxWidth: 320,
            width: '100%',
          }}
        >
          <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
            <FileIcon />
          </span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {f.name}
            </span>
            <span style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>
              {formatSize(f.size)}{isPreviewable(f) ? '・タップでプレビュー' : ''}
            </span>
          </span>
        </button>
      ))}

      {preview && <PreviewModal attachment={preview} onClose={() => setPreview(null)} />}
    </div>
  )
}
