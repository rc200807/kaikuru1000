'use client'

/**
 * 発行済みPDF（売買契約書・請求書・見積書）を画面上でプレビューするモーダル。
 *
 * 以前は一覧・詳細のリンクを押すと即ダウンロードが始まっていた（配信APIが
 * Content-Disposition: attachment 固定だったため）。中身を確かめたいだけの場面が
 * 多いので、まず inline で表示し、ダウンロードは明示的なボタンに分けている。
 *
 * iOS Safari など iframe 内の PDF を描画しない環境があるため、
 * 「新しいタブで開く」への逃げ道を常に併記する。
 */
import { useState } from 'react'
import Modal from '@/components/Modal'
import Button from '@/components/Button'

/** 配信APIのURLに表示方法を足す。inline=プレビュー、attachment=ダウンロード */
export function withDisposition(url: string, disposition: 'inline' | 'attachment'): string {
  return `${url}${url.includes('?') ? '&' : '?'}disposition=${disposition}`
}

export default function DocumentPdfPreview({
  open,
  title,
  url,
  onClose,
}: {
  open: boolean
  title: string
  /** /api/magic-link/document-pdf?... 形式のURL（disposition は内部で付与する） */
  url: string | null
  onClose: () => void
}) {
  const [failed, setFailed] = useState(false)
  if (!url) return null
  const inlineUrl = withDisposition(url, 'inline')
  const downloadUrl = withDisposition(url, 'attachment')

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="xl"
      disableBackdropClose={false}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="text" onClick={onClose}>閉じる</Button>
          <a
            href={inlineUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm px-4 py-2 rounded-full border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)]"
          >
            新しいタブで開く
          </a>
          <a
            href={downloadUrl}
            className="text-sm px-4 py-2 rounded-full bg-[var(--portal-primary)] text-[var(--portal-on-primary,#fff)] hover:opacity-90"
          >
            ダウンロード
          </a>
        </div>
      }
    >
      <div className="h-[70vh] min-h-[320px] rounded-lg overflow-hidden border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
        {failed ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">
              この端末ではPDFを画面内に表示できませんでした。
            </p>
            <a href={inlineUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-[var(--portal-primary)] hover:underline">
              新しいタブで開く →
            </a>
          </div>
        ) : (
          <iframe
            key={inlineUrl}
            src={inlineUrl}
            title={title}
            className="w-full h-full"
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </Modal>
  )
}
