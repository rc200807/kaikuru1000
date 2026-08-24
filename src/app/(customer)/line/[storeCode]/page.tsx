'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import GlassBackground from '@/components/customer/GlassBackground'
import GlassInput from '@/components/customer/GlassInput'
import GlassButton from '@/components/customer/GlassButton'
import MessageBanner from '@/components/MessageBanner'
import TurnstileWidget from '@/components/TurnstileWidget'

type LinePublicInfo = {
  storeName: string
  enabled: boolean
  addFriendUrl: string | null
}

export default function LineRegisterPage() {
  const params = useParams()
  const storeCode = params.storeCode as string

  const [info, setInfo] = useState<LinePublicInfo | null>(null)
  const [infoLoading, setInfoLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Form fields
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastNameKana, setLastNameKana] = useState('')
  const [firstNameKana, setFirstNameKana] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [address, setAddress] = useState('')
  const [postalLoading, setPostalLoading] = useState(false)
  const [postalError, setPostalError] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Turnstile (CAPTCHA) トークン
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const handleTurnstileVerify = useCallback((token: string) => setTurnstileToken(token), [])
  const handleTurnstileExpire = useCallback(() => setTurnstileToken(null), [])

  useEffect(() => {
    async function fetchInfo() {
      try {
        const res = await fetch(`/api/line/public/${storeCode}`)
        if (res.ok) {
          setInfo(await res.json())
        } else {
          setNotFound(true)
        }
      } catch {
        setNotFound(true)
      } finally {
        setInfoLoading(false)
      }
    }
    if (storeCode) fetchInfo()
  }, [storeCode])

  // 郵便番号から住所を自動入力（番地以降は入力不要）
  async function lookupAddress(code: string) {
    const cleaned = code.replace(/[-ー－\s]/g, '')
    if (cleaned.length !== 7) return
    setPostalLoading(true)
    setPostalError('')
    try {
      const res = await fetch(`/api/postal-lookup?zipcode=${cleaned}`)
      const data = await res.json()
      if (data.address) {
        setAddress(data.address)
      } else {
        setAddress('')
        setPostalError('この郵便番号の住所が見つかりませんでした')
      }
    } catch {
      setAddress('')
      setPostalError('住所の検索に失敗しました')
    } finally {
      setPostalLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const cleanPhone = phone.replace(/[-\s]/g, '')
    const cleanPostal = postalCode.replace(/[-ー－\s]/g, '')

    try {
      const res = await fetch('/api/line/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode,
          lastName,
          firstName,
          lastNameKana,
          firstNameKana,
          phone: cleanPhone,
          email: email || undefined,
          postalCode: cleanPostal,
          address: address || undefined,
          turnstileToken: turnstileToken || undefined,
        }),
      })

      const data = await res.json().catch(() => ({} as { error?: string; authUrl?: string }))
      if (!res.ok || !data.authUrl) {
        setError(data.error || '送信に失敗しました。もう一度お試しください')
        setLoading(false)
        return
      }

      // LINE Login の認可画面へ（同意画面内で友だち追加も完了する）
      window.location.href = data.authUrl
    } catch {
      setError('サーバーエラーが発生しました。もう一度お試しください')
      setLoading(false)
    }
  }

  if (notFound) {
    return (
      <GlassBackground maxWidth="max-w-lg">
        <div className="text-center py-10">
          <p className="text-sm text-gray-500">ページが見つかりませんでした</p>
        </div>
      </GlassBackground>
    )
  }

  return (
    <GlassBackground maxWidth="max-w-lg">
      {/* Header */}
      <div className="text-center mb-6">
        <img loading="lazy" decoding="async" src="/logo.svg" alt="買いクル" className="h-10 mx-auto mb-2" />
        {infoLoading ? (
          <p className="text-sm text-gray-400">読み込み中...</p>
        ) : info ? (
          <>
            <h1 className="text-lg font-bold text-gray-800">{info.storeName}</h1>
            <p className="text-sm text-gray-500 mt-0.5">LINE友だち登録</p>
          </>
        ) : (
          <p className="text-sm text-gray-500 mt-1">LINE友だち登録</p>
        )}
        <p className="text-xs text-gray-400 mt-2 leading-relaxed">
          お客様情報をご入力のうえ登録すると、LINEで査定のご相談や
          <br className="hidden sm:block" />
          お知らせの受け取りができるようになります
        </p>
      </div>

      {info && !info.enabled && !infoLoading && (
        <div className="mb-5">
          <MessageBanner severity="error">
            LINE登録は現在ご利用いただけません。お手数ですが店舗までお問い合わせください。
          </MessageBanner>
        </div>
      )}

      {error && (
        <div className="mb-5">
          <MessageBanner severity="error">{error}</MessageBanner>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <GlassInput
            label="姓"
            value={lastName}
            onChange={setLastName}
            required
            placeholder="山田"
          />
          <GlassInput
            label="名"
            value={firstName}
            onChange={setFirstName}
            required
            placeholder="太郎"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <GlassInput
            label="セイ（フリガナ）"
            value={lastNameKana}
            onChange={setLastNameKana}
            required
            placeholder="ヤマダ"
          />
          <GlassInput
            label="メイ（フリガナ）"
            value={firstNameKana}
            onChange={setFirstNameKana}
            required
            placeholder="タロウ"
          />
        </div>

        <GlassInput
          label="電話番号"
          type="tel"
          value={phone}
          onChange={setPhone}
          required
          placeholder="090-1234-5678"
        />

        <GlassInput
          label="メールアドレス（任意）"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="example@email.com"
        />

        <div>
          <GlassInput
            label="訪問先の郵便番号"
            value={postalCode}
            onChange={(v: string) => {
              setPostalCode(v)
              const cleaned = v.replace(/[-ー－\s]/g, '')
              if (cleaned.length === 7) lookupAddress(cleaned)
              else { setAddress(''); setPostalError('') }
            }}
            required
            placeholder="1234567"
          />
          {postalLoading && <p className="text-xs text-gray-400 mt-1 ml-1">住所を検索中...</p>}
          {postalError && <p className="text-xs text-red-400 mt-1 ml-1">{postalError}</p>}
          {address && (
            <div className="mt-2 px-4 py-2.5 rounded-2xl bg-white/50 border border-white/60">
              <p className="text-[11px] text-gray-400 mb-0.5">訪問先住所</p>
              <p className="text-sm text-gray-700">{address}</p>
            </div>
          )}
        </div>

        {/* CAPTCHA（NEXT_PUBLIC_TURNSTILE_SITE_KEY 未設定の場合は何も表示されない） */}
        <div className="flex justify-center pt-2">
          <TurnstileWidget
            onVerify={handleTurnstileVerify}
            onExpire={handleTurnstileExpire}
            theme="auto"
          />
        </div>

        <div className="pt-2">
          <GlassButton
            type="submit"
            variant="primary"
            loading={loading}
            disabled={
              loading
              || !info?.enabled
              || !lastName.trim() || !firstName.trim() || !lastNameKana.trim() || !firstNameKana.trim() || !phone.trim()
              || postalCode.replace(/[-ー－\s]/g, '').length !== 7
              // CAPTCHAキー設定時のみトークンを必須にする
              || (!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !turnstileToken)
            }
          >
            {loading ? '処理中...' : 'LINEで登録する'}
          </GlassButton>
        </div>
      </form>

      <p className="text-center text-xs text-gray-400 mt-5">
        登録ボタンを押すとLINEの認証画面に移動します。
        <br />
        送信いただいた情報は担当店舗でのみ利用されます
      </p>
    </GlassBackground>
  )
}
