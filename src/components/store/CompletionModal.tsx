'use client'

import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import Modal from '@/components/Modal'
import Button from '@/components/Button'

type PdfButton = { label: string; onClick: () => void }
/** サーバー保存済みPDFの直接ダウンロード（Content-Disposition: attachment で配信される） */
type DownloadLink = { label: string; href: string; filename?: string }

/**
 * 売買契約書・見積書の作成完了モーダル。
 * 完了と同時に立ち上げ、お客様用リンクのQRコード・URL・PDFダウンロード・次のアクションを提示する。
 */
export default function CompletionModal({
  open,
  onClose,
  title,
  subtitle,
  status = 'success',
  url,
  urlLoading = false,
  urlLabel = 'お客様用リンク',
  linkDescription,
  validityNote,
  downloads = [],
  pdfButtons = [],
  backLabel,
  onBack,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  /** warning = 発行はできたが一部未完了（メール未送信など） */
  status?: 'success' | 'warning'
  url: string | null
  urlLoading?: boolean
  urlLabel?: string
  linkDescription?: string
  validityNote?: string
  downloads?: DownloadLink[]
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

  const isWarn = status === 'warning'

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
        <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-3 ${
          isWarn ? 'bg-amber-100 dark:bg-amber-900/40' : 'bg-green-100 dark:bg-green-900/40'
        }`}>
          {isWarn ? (
            <svg className="w-9 h-9 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          ) : (
            <svg className="w-9 h-9 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          )}
        </div>
        <h2 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">{title}</h2>
        {subtitle && <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1 whitespace-pre-wrap">{subtitle}</p>}

        {/* QRコード / リンク */}
        <div className="mt-5 w-full">
          <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] text-left mb-1">{urlLabel}</p>
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] text-left mb-3">
            {linkDescription ?? 'お客様のスマホでこのQRコードを読み取ると、内容を確認できます。'}
          </p>
          <div className="flex flex-col items-center">
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
        </div>

        {/* PDFダウンロード（サーバー保存済み） */}
        {downloads.length > 0 && (
          <div className="mt-5 w-full border-t border-[var(--md-sys-color-outline-variant)] pt-4">
            <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] text-left mb-2">PDFをダウンロード</p>
            <div className="flex flex-wrap gap-2">
              {downloads.map((d, i) => (
                <a
                  key={i}
                  href={d.href}
                  download={d.filename}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full text-sm font-medium bg-[var(--portal-primary,#b91c1c)] text-[var(--portal-on-primary,#fff)] hover:opacity-90 transition-opacity"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0 0l-4-4m4 4l4-4M4 19.5h16" />
                  </svg>
                  {d.label}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* PDF確認（別タブ表示） */}
        {pdfButtons.length > 0 && (
          <div className="mt-5 w-full border-t border-[var(--md-sys-color-outline-variant)] pt-4">
            <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] text-left mb-2">PDFを確認（別タブで開く）</p>
            <div className="flex flex-wrap gap-2">
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
