'use client'

// 売買契約書・見積書の「LINEで送付」カード（契約書finalページ・見積ページ共通）
// - 顧客が既定チャネルにLINE連携済み → ワンタップで閲覧リンクをトークへ送付
// - 未連携 → 連携QRを表示。お客様がスキャンしてLINE連携すると、書類リンクが自動送付される
//   （QR表示中は5秒間隔でポーリングして送付完了を検知する）
// - 既定チャネル未設定（LINE Login未構成）の場合はカード自体を表示しない
import { useState, useEffect, useRef, useCallback } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import Card from '@/components/Card'
import Button from '@/components/Button'

type DocType = 'contract' | 'estimate'

type LineStatus = {
  enabled: boolean
  linked: boolean
  isFollowing: boolean
  lineSentAt: string | null
}

const DOC_LABELS: Record<DocType, string> = {
  contract: '売買契約書',
  estimate: '見積書',
}

export default function LineSendCard({
  visitScheduleId,
  docType,
}: {
  visitScheduleId: string
  docType: DocType
}) {
  const [status, setStatus] = useState<LineStatus | null>(null)
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchStatus = useCallback(async (): Promise<LineStatus | null> => {
    try {
      const res = await fetch(`/api/visit-schedules/${visitScheduleId}/send-line?docType=${docType}`)
      if (!res.ok) return null
      const data: LineStatus = await res.json()
      setStatus(data)
      return data
    } catch {
      return null
    }
  }, [visitScheduleId, docType])

  useEffect(() => {
    fetchStatus()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [fetchStatus])

  // QR表示中: 連携＆自動送付の完了をポーリングで検知
  useEffect(() => {
    if (!authUrl) return
    pollRef.current = setInterval(async () => {
      const s = await fetchStatus()
      if (s?.linked) {
        setAuthUrl(null)
        setNotice(
          s.lineSentAt
            ? { type: 'success', text: `LINE連携が完了し、${DOC_LABELS[docType]}を送付しました` }
            : { type: 'error', text: 'LINE連携は完了しましたが送付に失敗しました。「LINEへ送付」からやり直してください' }
        )
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }, 5000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [authUrl, fetchStatus, docType])

  async function showQr() {
    setQrLoading(true)
    setNotice(null)
    try {
      const res = await fetch('/api/store/line/link-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitScheduleId, docType }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNotice({ type: 'error', text: data.error ?? 'QRコードの発行に失敗しました' })
        return
      }
      if (data.alreadyLinked) {
        // 表示ズレ（別端末で連携済み等）→ ステータスを取り直して送付ボタンに切替
        await fetchStatus()
        return
      }
      if (!data.enabled) {
        setNotice({ type: 'error', text: 'LINE連携が未設定のため利用できません' })
        return
      }
      setAuthUrl(data.authUrl)
    } finally {
      setQrLoading(false)
    }
  }

  async function handleSend() {
    setSending(true)
    setNotice(null)
    try {
      const res = await fetch(`/api/visit-schedules/${visitScheduleId}/send-line`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docType }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setNotice({ type: 'success', text: `${DOC_LABELS[docType]}をLINEに送付しました` })
        fetchStatus()
      } else {
        setNotice({ type: 'error', text: data.error ?? '送付に失敗しました' })
      }
    } catch {
      setNotice({ type: 'error', text: 'ネットワークエラーが発生しました' })
    } finally {
      setSending(false)
    }
  }

  // 既定チャネル未設定（LINE Login未構成）なら何も出さない
  if (!status?.enabled) return null

  return (
    <Card variant="elevated" padding="md">
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-[#06C755] text-white text-[10px] font-bold">L</span>
        <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">LINEで送付</h2>
        {status.lineSentAt && (
          <span className="ml-auto text-[10px] font-semibold text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 border border-green-300 dark:border-green-700 rounded-full px-2 py-0.5">
            送付済み
          </span>
        )}
      </div>

      {notice && (
        <p className={`text-xs mb-3 px-3 py-2 rounded-lg ${
          notice.type === 'success'
            ? 'text-green-800 dark:text-green-200 bg-green-50 dark:bg-green-950/30 border border-green-300 dark:border-green-700'
            : 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-700'
        }`}>
          {notice.text}
        </p>
      )}

      {status.linked ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            このお客様はLINE連携済みです。{DOC_LABELS[docType]}の閲覧リンクをトークへ送付できます
            {!status.isFollowing && (
              <span className="block text-red-500 mt-1">
                ⚠ お客様が友だち解除（ブロック）しているため届かない可能性があります
              </span>
            )}
          </p>
          <Button variant="outlined" onClick={handleSend} disabled={sending}>
            {sending ? '送付中...' : status.lineSentAt ? 'もう一度LINEへ送付' : 'LINEへ送付'}
          </Button>
        </div>
      ) : authUrl ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] text-center">
            お客様のスマートフォンでこのQRコードを読み取り、LINE連携してください。
            <br />
            連携が完了すると{DOC_LABELS[docType]}の閲覧リンクが自動でLINEに届きます
          </p>
          <div className="p-3 bg-white rounded-xl border border-[var(--md-sys-color-outline-variant)]">
            <QRCodeSVG value={authUrl} size={200} />
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
            <span className="w-3.5 h-3.5 border-2 border-[var(--portal-primary)] border-t-transparent rounded-full animate-spin" />
            連携をお待ちしています...
          </div>
          <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            QRコードは15分間有効です。
            <button onClick={showQr} className="text-[var(--portal-primary)] hover:underline ml-1">
              再発行する
            </button>
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
            お客様のLINEに{DOC_LABELS[docType]}の閲覧リンクを送付できます。
            まずQRコードでLINE連携をお願いしてください（連携完了と同時に自動送付されます）
          </p>
          <Button variant="outlined" onClick={showQr} disabled={qrLoading}>
            {qrLoading ? '発行中...' : '連携QRコードを表示'}
          </Button>
        </div>
      )}
    </Card>
  )
}
