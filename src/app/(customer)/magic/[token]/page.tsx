'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { use } from 'react'
import Link from 'next/link'
import GlassBackground from '@/components/customer/GlassBackground'
import GlassButton from '@/components/customer/GlassButton'

export default function MagicLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const requirePasswordSetup = searchParams.get('setup') === '1'
  const [error, setError] = useState('')
  const [verifying, setVerifying] = useState(true)

  useEffect(() => {
    async function verify() {
      try {
        // まずマジックリンクの情報を取得（contractIdなど）
        const infoRes = await fetch('/api/magic-link/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, peek: true }),
        })
        const infoData = await infoRes.json()

        if (!infoRes.ok) {
          setError(infoData.error || 'リンクの検証に失敗しました')
          setVerifying(false)
          return
        }

        // NextAuthでログイン（本物のセッション作成）
        const result = await signIn('magic-link', {
          token,
          redirect: false,
        })

        if (result?.error || !result?.ok) {
          setError('ログインに失敗しました。リンクが期限切れの可能性があります。')
          setVerifying(false)
          return
        }

        // setup=1 の場合はパスワード設定ページへ
        if (requirePasswordSetup) {
          const next = infoData.contractId ? `/contract-view?id=${infoData.contractId}` : '/mypage'
          router.replace(`/account-setup?next=${encodeURIComponent(next)}`)
        } else if (infoData.contractId) {
          router.replace(`/contract-view?id=${infoData.contractId}`)
        } else {
          router.replace('/mypage')
        }
      } catch {
        setError('通信エラーが発生しました。もう一度お試しください。')
        setVerifying(false)
      }
    }

    verify()
  }, [token, router, requirePasswordSetup])

  if (verifying) {
    return (
      <GlassBackground>
        <div className="text-center py-4">
          <div className="inline-block w-10 h-10 border-4 border-white/40 border-t-red-500 rounded-full animate-spin mb-4" />
          <p className="text-gray-600 text-sm">認証中...</p>
        </div>
      </GlassBackground>
    )
  }

  if (error) {
    return (
      <GlassBackground>
        <div className="text-center">
          <div className="w-14 h-14 bg-red-100/80 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-800 mb-2">リンクが無効です</h1>
          <p className="text-gray-500 text-sm mb-6">{error}</p>
          <Link href="/login">
            <GlassButton variant="primary">
              ログインページへ
            </GlassButton>
          </Link>
        </div>
      </GlassBackground>
    )
  }

  return null
}
