'use client'

import { Suspense, useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import GlassBackground from '@/components/customer/GlassBackground'
import MessageBanner from '@/components/MessageBanner'

type LinePublicInfo = {
  storeName: string
  enabled: boolean
  addFriendUrl: string | null
}

const ERROR_MESSAGES: Record<string, string> = {
  cancelled: 'LINE連携がキャンセルされました。もう一度お試しください。',
  invalid: 'リンクが無効です。お手数ですが最初からやり直してください。',
  used: 'このリンクは使用済みです。お手数ですが最初からやり直してください。',
  expired: 'リンクの有効期限が切れました。お手数ですが最初からやり直してください。',
  channel: 'LINE連携の設定に問題があります。店舗までお問い合わせください。',
  auth: 'LINE認証に失敗しました。もう一度お試しください。',
  server: 'サーバーエラーが発生しました。もう一度お試しください。',
}

function CompleteContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const storeCode = params.storeCode as string

  const errorCode = searchParams.get('error')
  const isFriend = searchParams.get('friend') === 'true'
  const error = errorCode ? (ERROR_MESSAGES[errorCode] || ERROR_MESSAGES.server) : null
  // 契約書・見積書のQR連携経由（連携完了と同時にLINEへ書類リンクを自動送付）
  const docLabel = searchParams.get('doc') === 'contract' ? '売買契約書'
    : searchParams.get('doc') === 'estimate' ? 'お見積書' : null
  const docSent = searchParams.get('sent') === 'true'

  const [info, setInfo] = useState<LinePublicInfo | null>(null)

  useEffect(() => {
    async function fetchInfo() {
      try {
        const res = await fetch(`/api/line/public/${storeCode}`)
        if (res.ok) setInfo(await res.json())
      } catch { /* ignore */ }
    }
    if (storeCode) fetchInfo()
  }, [storeCode])

  if (error) {
    return (
      <div className="space-y-6">
        <div className="mb-5">
          <MessageBanner severity="error">{error}</MessageBanner>
        </div>
        <div className="text-center">
          <a
            href={`/line/${storeCode}`}
            className="inline-block px-6 py-3 rounded-2xl bg-white/60 border border-white/70 text-sm font-medium text-gray-700 hover:bg-white/80 transition-colors"
          >
            登録フォームに戻る
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="text-center space-y-6">
      {/* Success icon */}
      <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/25">
        <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </div>

      <div>
        <h2 className="text-xl font-bold text-gray-800 mb-2">
          {docLabel ? 'LINE連携が完了しました' : '登録が完了しました'}
        </h2>
        <p className="text-sm text-gray-500">
          {docLabel
            ? (docSent
              ? `${docLabel}をLINEのトークにお送りしました。LINEを開いてご確認ください`
              : `${docLabel}の送付に失敗しました。お手数ですが店舗スタッフにお声がけください`)
            : isFriend
              ? 'LINEのトークから査定のご相談やお問い合わせができます'
              : 'あと少しです。下のボタンから友だち追加をお願いします'}
        </p>
      </div>

      {!isFriend && info?.addFriendUrl && (
        <a
          href={info.addFriendUrl}
          className="inline-block px-8 py-3.5 rounded-2xl bg-[#06C755] text-white text-sm font-bold shadow-lg shadow-green-500/25 hover:opacity-90 transition-opacity"
        >
          LINEで友だち追加する
        </a>
      )}

      {info?.storeName && (
        <div className="bg-white/40 rounded-2xl p-4 border border-white/50">
          <p className="text-xs text-gray-400 mb-1">担当店舗</p>
          <p className="text-sm font-semibold text-gray-700">{info.storeName}</p>
        </div>
      )}
    </div>
  )
}

export default function LineRegisterCompletePage() {
  return (
    <GlassBackground maxWidth="max-w-lg">
      <Suspense fallback={<p className="text-center text-sm text-gray-400 py-10">読み込み中...</p>}>
        <CompleteContent />
      </Suspense>
    </GlassBackground>
  )
}
