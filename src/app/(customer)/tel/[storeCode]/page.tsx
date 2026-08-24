'use client'

// 電話問い合わせフォーム（公開ページ・店舗ごと）
// お客様情報を入力して「電話をかける」を押すと、顧客登録と同時に発信する。
// 電話は履歴が残らないため、発信前に情報を取得して顧客として記録する狙い。
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import GlassBackground from '@/components/customer/GlassBackground'
import GlassInput from '@/components/customer/GlassInput'
import GlassButton from '@/components/customer/GlassButton'
import MessageBanner from '@/components/MessageBanner'
import TurnstileWidget from '@/components/TurnstileWidget'

type StoreInfo = {
  name: string
  address: string | null
  phone: string | null
}

export default function TelInquiryPage() {
  const params = useParams()
  const storeCode = params.storeCode as string

  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null)
  const [storeLoading, setStoreLoading] = useState(true)
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
  const [calledTel, setCalledTel] = useState<string | null>(null)

  // Turnstile (CAPTCHA) トークン
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const handleTurnstileVerify = useCallback((token: string) => setTurnstileToken(token), [])
  const handleTurnstileExpire = useCallback(() => setTurnstileToken(null), [])

  useEffect(() => {
    async function fetchStore() {
      try {
        const res = await fetch(`/api/stores/public/${storeCode}`)
        if (res.ok) setStoreInfo(await res.json())
        else setNotFound(true)
      } catch {
        setNotFound(true)
      } finally {
        setStoreLoading(false)
      }
    }
    if (storeCode) fetchStore()
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
      const res = await fetch('/api/tel/register', {
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

      const data = await res.json().catch(() => ({} as { error?: string; tel?: string }))
      if (!res.ok || !data.tel) {
        setError(data.error || '送信に失敗しました。もう一度お試しください')
        return
      }

      // 顧客登録が完了したので発信する
      setCalledTel(data.tel)
      window.location.href = `tel:${data.tel.replace(/[-\s]/g, '')}`
    } catch {
      setError('サーバーエラーが発生しました。もう一度お試しください')
    } finally {
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

  // 発信後の画面（スマホのダイヤラーから戻ってきたときにここが見える）
  if (calledTel) {
    const telHref = `tel:${calledTel.replace(/[-\s]/g, '')}`
    return (
      <GlassBackground maxWidth="max-w-lg">
        <div className="text-center space-y-6">
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/25">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
            </svg>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">お客様情報を受け付けました</h2>
            <p className="text-sm text-gray-500">
              電話アプリが起動しない場合は、下の番号をタップしてください
            </p>
          </div>

          <a
            href={telHref}
            className="inline-block px-8 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-500 to-green-500 text-white text-lg font-bold shadow-lg shadow-green-500/25 hover:opacity-90 transition-opacity tracking-wider"
          >
            {calledTel}
          </a>

          {storeInfo && (
            <div className="bg-white/40 rounded-2xl p-4 border border-white/50">
              <p className="text-xs text-gray-400 mb-1">担当店舗</p>
              <p className="text-sm font-semibold text-gray-700">{storeInfo.name}</p>
            </div>
          )}
        </div>
      </GlassBackground>
    )
  }

  return (
    <GlassBackground maxWidth="max-w-lg">
      {/* Header */}
      <div className="text-center mb-6">
        <img loading="lazy" decoding="async" src="/logo.svg" alt="買いクル" className="h-10 mx-auto mb-2" />
        {storeLoading ? (
          <p className="text-sm text-gray-400">読み込み中...</p>
        ) : storeInfo ? (
          <>
            <h1 className="text-lg font-bold text-gray-800">{storeInfo.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">お電話でのお問い合わせ</p>
          </>
        ) : (
          <p className="text-sm text-gray-500 mt-1">お電話でのお問い合わせ</p>
        )}
        <p className="text-xs text-gray-400 mt-2 leading-relaxed">
          お客様情報をご入力のうえ発信いただくと、
          <br className="hidden sm:block" />
          お電話がつながった際のご案内がスムーズになります
        </p>
      </div>

      {error && (
        <div className="mb-5">
          <MessageBanner severity="error">{error}</MessageBanner>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <GlassInput label="姓" value={lastName} onChange={setLastName} required placeholder="山田" />
          <GlassInput label="名" value={firstName} onChange={setFirstName} required placeholder="太郎" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <GlassInput label="セイ（フリガナ）" value={lastNameKana} onChange={setLastNameKana} required placeholder="ヤマダ" />
          <GlassInput label="メイ（フリガナ）" value={firstNameKana} onChange={setFirstNameKana} required placeholder="タロウ" />
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
          <TurnstileWidget onVerify={handleTurnstileVerify} onExpire={handleTurnstileExpire} theme="auto" />
        </div>

        <div className="pt-2">
          <GlassButton
            type="submit"
            variant="primary"
            loading={loading}
            disabled={
              loading
              || !lastName.trim() || !firstName.trim() || !lastNameKana.trim() || !firstNameKana.trim()
              || !phone.trim() || postalCode.replace(/[-ー－\s]/g, '').length !== 7
              // CAPTCHAキー設定時のみトークンを必須にする
              || (!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !turnstileToken)
            }
          >
            {loading ? '処理中...' : '電話をかける'}
          </GlassButton>
        </div>
      </form>

      <p className="text-center text-xs text-gray-400 mt-5">
        ボタンを押すと電話アプリが起動します。
        <br />
        送信いただいた情報は担当店舗でのみ利用されます
      </p>
    </GlassBackground>
  )
}
