'use client'

import type { ChatAttachment } from './types'

function formatSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function FileIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  )
}

/** メッセージ内の添付表示（画像＝サムネ、ファイル＝ダウンロードチップ） */
export default function AttachmentView({ attachments }: { attachments: ChatAttachment[] }) {
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
            <a key={i} href={img.url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
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
            </a>
          ))}
        </div>
      )}
      {files.map((f, i) => (
        <a
          key={i}
          href={f.url}
          target="_blank"
          rel="noopener noreferrer"
          download={f.name}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid var(--md-sys-color-outline-variant)',
            background: 'var(--md-sys-color-surface-container-lowest)',
            color: 'var(--md-sys-color-on-surface)',
            textDecoration: 'none',
            maxWidth: 320,
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
            <span style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>{formatSize(f.size)}</span>
          </span>
        </a>
      ))}
    </div>
  )
}
