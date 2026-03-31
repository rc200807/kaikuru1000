'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import GlassBackground from '@/components/customer/GlassBackground'
import GlassInput from '@/components/customer/GlassInput'
import GlassButton from '@/components/customer/GlassButton'
import MessageBanner from '@/components/MessageBanner'

const INQUIRY_TYPES = [
  { value: '査定申し込み', label: '査定申し込み' },
  { value: '出張買取', label: '出張買取' },
  { value: '遺品整理', label: '遺品整理' },
  { value: 'その他', label: 'その他' },
] as const

type StoreInfo = {
  name: string
  address: string | null
  phone: string | null
}

export default function InquiryPage() {
  const params = useParams()
  const storeCode = params.storeCode as string

  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null)
  const [storeLoading, setStoreLoading] = useState(true)

  // Form fields
  const [name, setName] = useState('')
  const [furigana, setFurigana] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [address, setAddress] = useState('')
  const [inquiryType, setInquiryType] = useState('査定申し込み')
  const [details, setDetails] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [hadEmail, setHadEmail] = useState(false)
  const [postalLoading, setPostalLoading] = useState(false)

  // 郵便番号から住所を自動入力（サーバーサイドプロキシ経由）
  async function lookupAddress(code: string) {
    const cleaned = code.replace(/[-ー\s]/g, '')
    if (cleaned.length !== 7) return
    setPostalLoading(true)
    try {
      const res = await fetch(`/api/postal-lookup?zipcode=${cleaned}`)
      const data = await res.json()
      if (data.address) {
        setAddress(data.address)
      }
    } catch { /* ignore */ }
    finally { setPostalLoading(false) }
  }

  useEffect(() => {
    async function fetchStore() {
      try {
        const res = await fetch(`/api/stores/public/${storeCode}`)
        if (res.ok) {
          const data = await res.json()
          setStoreInfo(data)
        }
      } catch {
        // Store info is optional - form still works
      } finally {
        setStoreLoading(false)
      }
    }
    if (storeCode) fetchStore()
  }, [storeCode])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Strip hyphens from phone number
    const cleanPhone = phone.replace(/[-\s]/g, '')
    // Strip hyphen from postal code
    const cleanPostalCode = postalCode.replace(/[-\s]/g, '')

    try {
      const res = await fetch('/api/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeCode,
          name,
          furigana,
          phone: cleanPhone,
          email: email || undefined,
          postalCode: cleanPostalCode || undefined,
          address,
          inquiryType,
          details: details || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || '送信に失敗しました。もう一度お試しください')
        return
      }

      setHadEmail(!!email)
      setSubmitted(true)
    } catch {
      setError('サーバーエラーが発生しました。もう一度お試しください')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <GlassBackground maxWidth="max-w-lg">
        <div className="text-center space-y-6">
          {/* Success icon */}
          <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-500/25">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>

          <div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">
              お問い合わせを受け付けました
            </h2>
            <p className="text-sm text-gray-500">
              {hadEmail
                ? 'メールアドレスにご案内をお送りしました'
                : '担当店舗よりご連絡させていただきます'}
            </p>
          </div>

          {storeInfo && (
            <div className="bg-white/40 rounded-2xl p-4 border border-white/50">
              <p className="text-xs text-gray-400 mb-1">担当店舗</p>
              <p className="text-sm font-semibold text-gray-700">{storeInfo.name}</p>
              {storeInfo.phone && (
                <p className="text-xs text-gray-500 mt-1">{storeInfo.phone}</p>
              )}
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
        <img src="/logo.svg" alt="買いクル" className="h-10 mx-auto mb-2" />
        {storeLoading ? (
          <p className="text-sm text-gray-400">読み込み中...</p>
        ) : storeInfo ? (
          <>
            <h1 className="text-lg font-bold text-gray-800">{storeInfo.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">お問い合わせフォーム</p>
          </>
        ) : (
          <p className="text-sm text-gray-500 mt-1">お問い合わせフォーム</p>
        )}
      </div>

      {error && (
        <div className="mb-5">
          <MessageBanner severity="error">{error}</MessageBanner>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <GlassInput
          label="氏名"
          value={name}
          onChange={setName}
          required
          placeholder="山田 太郎"
        />

        <GlassInput
          label="フリガナ"
          value={furigana}
          onChange={setFurigana}
          required
          placeholder="ヤマダ タロウ"
        />

        <GlassInput
          label="電話番号"
          type="tel"
          value={phone}
          onChange={setPhone}
          required
          placeholder="090-1234-5678"
        />

        <GlassInput
          label="メールアドレス"
          type="email"
          value={email}
          onChange={setEmail}
          required
          placeholder="example@email.com"
        />

        <div>
          <GlassInput
            label="郵便番号"
            value={postalCode}
            onChange={(v: string) => {
              setPostalCode(v)
              const cleaned = v.replace(/[-ー\s]/g, '')
              if (cleaned.length === 7) lookupAddress(cleaned)
            }}
            required
            placeholder="1234567"
          />
          {postalLoading && (
            <p className="text-xs text-gray-400 mt-1 ml-1">住所を検索中...</p>
          )}
        </div>

        <GlassInput
          label="住所"
          value={address}
          onChange={setAddress}
          required
          placeholder="東京都渋谷区..."
        />

        {/* Inquiry type radio buttons */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-2 ml-1">
            申込み内容<span className="text-red-400 ml-0.5">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            {INQUIRY_TYPES.map((t) => (
              <label
                key={t.value}
                className={`
                  flex items-center gap-2 px-4 py-3 rounded-2xl cursor-pointer transition-all text-sm
                  ${inquiryType === t.value
                    ? 'bg-red-50/80 border-2 border-red-400/60 text-red-700 font-medium shadow-sm'
                    : 'bg-white/40 border border-white/60 text-gray-600 hover:bg-white/60'}
                `}
              >
                <div className={`
                  w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all
                  ${inquiryType === t.value ? 'border-red-500' : 'border-gray-300'}
                `}>
                  {inquiryType === t.value && (
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                  )}
                </div>
                <input
                  type="radio"
                  name="inquiryType"
                  value={t.value}
                  checked={inquiryType === t.value}
                  onChange={(e) => setInquiryType(e.target.value)}
                  className="sr-only"
                />
                {t.label}
              </label>
            ))}
          </div>
        </div>

        <GlassInput
          label="相談内容詳細"
          value={details}
          onChange={setDetails}
          rows={4}
          placeholder="ご質問やご要望があればご記入ください（任意）"
        />

        <div className="pt-2">
          <GlassButton type="submit" variant="primary" loading={loading} disabled={loading || !name.trim() || !furigana.trim() || !phone.trim() || !email.trim() || !postalCode.trim() || !address.trim()}>
            {loading ? '送信中...' : 'お問い合わせを送信'}
          </GlassButton>
        </div>
      </form>

      <p className="text-center text-xs text-gray-400 mt-5">
        送信いただいた情報は担当店舗でのみ利用されます
      </p>
    </GlassBackground>
  )
}
