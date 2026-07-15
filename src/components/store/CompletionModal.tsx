'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import Modal from '@/components/Modal'
import Button from '@/components/Button'

type PdfButton = { label: string; onClick: () => void }

/**
 * 売買契約書・見積書の作成完了モーダル。
 * 完了と同時に立ち上げ、お客様用リンクのQRコード・URL・次のアクションを提示する。
 */
export default function CompletionModal({
  open,
  onClose,
  title,
  subtitle,
  url,
  urlLoading = false,
  linkDescription,
  validityNote,
  pdfButtons = [],
  backLabel,
  onBack,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  url: string | null
  urlLoading?: boolean
  linkDescription?: string
  validityNote?: string
  pdfButtons?: PdfButton[]
  backLabel: string
  onBack: () => void
}) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    if (!url) return
    navigator.clipboard?.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      footer={
        <>
          <Button variant="text" onClick={onClose}>閉じる</Button>
          <Button onClick={onBack}>{backLabel}へ移動</Button>
        </>
      }
    >
      <div className="flex flex-col items-center text-center">
        {/* 成功アイコン */}
        <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center mb-3">
          <svg className="w-9 h-9 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">{title}</h2>
        {subtitle && <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1 whitespace-pre-wrap">{subtitle}</p>}
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-2">
          {linkDescription ?? 'お客様のスマホでこのQRコードを読み取ると、内容を確認できます。'}
        </p>

        {/* QRコード / リンク */}
        <div className="mt-4 w-full flex flex-col items-center">
          {urlLoading || !url ? (
            <div className="w-[200px] h-[200px] flex items-center justify-center rounded-xl bg-[var(--md-sys-color-surface-container)]">
              {urlLoading ? (
                <span className="flex flex-col items-center gap-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                  <span className="w-6 h-6 border-2 border-[var(--portal-primary,#b91c1c)] border-t-transparent rounded-full animate-spin" />
                  リンクを発行中...
                </span>
              ) : (
                <span className="text-xs text-[var(--md-sys-color-on-surface-variant)]">リンクを準備できませんでした</span>
              )}
            </div>
          ) : (
            <>
              <div className="bg-white p-3 rounded-xl border border-[var(--md-sys-color-outline-variant)]">
                <QRCodeSVG value={url} size={200} />
              </div>
              <div className="w-full flex items-center gap-2 mt-3">
                <input readOnly value={url} className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface-variant)]" />
                <Button size="sm" variant="tonal" onClick={copy}>{copied ? 'コピー済' : 'リンクをコピー'}</Button>
              </div>
              {validityNote && <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-2">{validityNote}</p>}
            </>
          )}
        </div>

        {/* PDF確認ボタン */}
        {pdfButtons.length > 0 && (
          <div className="mt-5 w-full border-t border-[var(--md-sys-color-outline-variant)] pt-4">
            <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-2">PDFを確認</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {pdfButtons.map((b, i) => (
                <Button key={i} size="sm" variant="tonal" onClick={b.onClick}>{b.label}</Button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
