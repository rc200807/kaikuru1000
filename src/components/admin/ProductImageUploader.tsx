'use client'

import { useRef, useState } from 'react'

type Props = {
  value: string
  onChange: (url: string) => void
  onError?: (msg: string) => void
  disabled?: boolean
}

export default function ProductImageUploader({ value, onChange, onError, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      onError?.('画像ファイルのみアップロードできます')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.url) {
        onError?.(data.error ?? 'アップロードに失敗しました')
        return
      }
      onChange(data.url)
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: 8,
          border: '1px dashed var(--md-sys-color-outline-variant)',
          background: 'var(--md-sys-color-surface)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {value
          ? <img src={value} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>未設定</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleFile(f)
          }}
          disabled={disabled || uploading}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            background: 'transparent',
            color: 'var(--md-sys-color-primary)',
            border: '1px solid var(--md-sys-color-outline)',
            fontSize: 13,
            cursor: disabled || uploading ? 'not-allowed' : 'pointer',
          }}
        >
          {uploading ? 'アップロード中…' : value ? '画像を変更' : '画像を選択'}
        </button>
        {value && !disabled && (
          <button
            type="button"
            onClick={() => onChange('')}
            disabled={uploading}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              background: 'transparent',
              color: 'var(--md-sys-color-error)',
              border: 'none',
              fontSize: 12,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            画像を削除
          </button>
        )}
      </div>
    </div>
  )
}
