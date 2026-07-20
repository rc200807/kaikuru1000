'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import GlassBackground from '@/components/customer/GlassBackground'
import GlassInput from '@/components/customer/GlassInput'
import GlassButton from '@/components/customer/GlassButton'
import MessageBanner from '@/components/MessageBanner'
import TurnstileWidget from '@/components/TurnstileWidget'
import { convertToJpegIfNeeded } from '@/lib/image-utils'
import ConversionBeacon from '@/components/tracking/ConversionBeacon'

const INQUIRY_TYPES = [
  { value: '査定申し込み', label: '査定申し込み' },
  { value: '出張買取', label: '出張買取' },
  { value: '遺品整理', label: '遺品整理' },
  { value: 'その他', label: 'その他' },
] as const

const ITEM_TYPES = ['査定申し込み', '出張買取']
const MAX_ITEMS = 5

type StoreInfo = {
  name: string
  address: string | null
  phone: string | null
}

type ItemEntry = {
  file: File | null
  preview: string
  title: string
}

export default function InquiryPage() {
  const params = useParams()
  const storeCode = params.storeCode as string

  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null)
  const [storeLoading, setStoreLoading] = useState(true)

  // Form fields
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastNameKana, setLastNameKana] = useState('')
  const [firstNameKana, setFirstNameKana] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [address, setAddress] = useState('')
  const [inquiryType, setInquiryType] = useState('査定申し込み')
  const [details, setDetails] = useState('')

  // Item entries for 査定申し込み / 出張買取
  const [items, setItems] = useState<ItemEntry[]>([])
  const fileInputRefs = useRef<(HTMLInputElement | null)[]>([])

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submittedInquiryId, setSubmittedInquiryId] = useState<string | undefined>(undefined)
  const [hadEmail, setHadEmail] = useState(false)
  const [registeredItemCount, setRegisteredItemCount] = useState(0)
  const [postalLoading, setPostalLoading] = useState(false)

  // Turnstile (CAPTCHA) トークン
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const handleTurnstileVerify = useCallback((token: string) => setTurnstileToken(token), [])
  const handleTurnstileExpire = useCallback(() => setTurnstileToken(null), [])

  const showItemSection = ITEM_TYPES.includes(inquiryType)

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

  // アクセス計測のクロスドメインリンカー（?_rctv=訪問者ID）を受け取り保持。URLからは除去する
  useEffect(() => {
    try {
      const url = new URL(window.location.href)
      const vk = url.searchParams.get('_rctv')
      if (vk) {
        sessionStorage.setItem('_rct_vid_sys', vk)
        url.searchParams.delete('_rctv')
        window.history.replaceState(null, '', url.toString())
      }
    } catch { /* ignore */ }
  }, [])

  // Clear items when switching away from item-supporting types
  useEffect(() => {
    if (!showItemSection) {
      // Revoke preview URLs
      items.forEach((item) => {
        if (item.preview) URL.revokeObjectURL(item.preview)
      })
      setItems([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showItemSection])

  function addItem() {
    if (items.length >= MAX_ITEMS) return
    setItems((prev) => [...prev, { file: null, preview: '', title: '' }])
  }

  function removeItem(index: number) {
    setItems((prev) => {
      const removed = prev[index]
      if (removed.preview) URL.revokeObjectURL(removed.preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  function updateItemTitle(index: number, title: string) {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, title } : item)))
  }

  async function handleFileChange(index: number, file: File | null) {
    if (!file) return
    try {
      const converted = await convertToJpegIfNeeded(file)
      const preview = URL.createObjectURL(converted)
      setItems((prev) =>
        prev.map((item, i) => {
          if (i === index) {
            if (item.preview) URL.revokeObjectURL(item.preview)
            return { ...item, file: converted, preview }
          }
          return item
        })
      )
    } catch {
      // fallback: use original file
      const preview = URL.createObjectURL(file)
      setItems((prev) =>
        prev.map((item, i) => {
          if (i === index) {
            if (item.preview) URL.revokeObjectURL(item.preview)
            return { ...item, file, preview }
          }
          return item
        })
      )
    }
  }

  async function uploadItemImages(): Promise<Array<{ title: string; imageUrl: string }>> {
    const results: Array<{ title: string; imageUrl: string }> = []
    for (const item of items) {
      if (!item.title.trim()) continue
      let imageUrl = ''
      if (item.file) {
        const formData = new FormData()
        formData.append('file', item.file)
        try {
          const res = await fetch('/api/inquiry/images', {
            method: 'POST',
            body: formData,
          })
          if (res.ok) {
            const data = await res.json()
            imageUrl = data.url
          }
        } catch {
          // Image upload failed, continue without image
        }
      }
      results.push({ title: item.title.trim(), imageUrl })
    }
    return results
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Strip hyphens from phone number
    const cleanPhone = phone.replace(/[-\s]/g, '')
    // Strip hyphen from postal code
    const cleanPostalCode = postalCode.replace(/[-\s]/g, '')

    try {
      // Upload item images first
      let uploadedItems: Array<{ title: string; imageUrl: string }> = []
      if (showItemSection && items.length > 0) {
        uploadedItems = await uploadItemImages()
      }

      const res = await fetch('/api/inquiry', {
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
          postalCode: cleanPostalCode || undefined,
          address,
          inquiryType,
          details: details || undefined,
          items: uploadedItems.length > 0 ? uploadedItems : undefined,
          turnstileToken: turnstileToken || undefined,
          trackingVisitorKey: (() => { try { return sessionStorage.getItem('_rct_vid_sys') || undefined } catch { return undefined } })(),
        }),
      })

      const data = await res.json().catch(() => ({} as { error?: string; inquiryId?: string }))
      if (!res.ok) {
        setError(data.error || '送信に失敗しました。もう一度お試しください')
        return
      }

      setHadEmail(!!email)
      setRegisteredItemCount(uploadedItems.length)
      setSubmittedInquiryId(data.inquiryId)
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
        {/* 受付完了画面の表示＝CV。アクセス計測に問い合わせCVを記録する */}
        <ConversionBeacon inquiryId={submittedInquiryId} />
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
            {registeredItemCount > 0 && (
              <p className="text-sm text-emerald-600 mt-2 font-medium">
                {registeredItemCount}件の商品が買取トライに登録されました
              </p>
            )}
          </div>

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

        {/* Item input section for 査定申し込み / 出張買取（一旦非表示・運用見直し中） */}
        {false && showItemSection && (
          <div className="bg-white/50 rounded-2xl p-4 border border-white/60 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-700">
                買取希望品を登録（写真とアイテム名）
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                写真を撮って登録すると、マイページでAI簡易査定ができます
              </p>
            </div>

            {items.map((item, index) => (
              <div
                key={index}
                className="flex items-start gap-3 bg-white/60 rounded-xl p-3 border border-white/70"
              >
                {/* Photo upload */}
                <div className="flex-shrink-0">
                  <input
                    ref={(el) => { fileInputRefs.current[index] = el }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    className="sr-only"
                    onChange={(e) => handleFileChange(index, e.target.files?.[0] || null)}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRefs.current[index]?.click()}
                    className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center overflow-hidden hover:border-red-300 transition-colors bg-gray-50/50"
                  >
                    {item.preview ? (
                      <img
                        src={item.preview}
                        alt="プレビュー"
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : (
                      <svg
                        className="w-6 h-6 text-gray-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"
                        />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z"
                        />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Title input + remove */}
                <div className="flex-1 min-w-0">
                  <input
                    type="text"
                    value={item.title}
                    onChange={(e) => updateItemTitle(index, e.target.value)}
                    placeholder="品名（例: ルイヴィトン バッグ）"
                    className="w-full text-sm bg-transparent border-b border-gray-200 focus:border-red-400 outline-none py-1.5 text-gray-700 placeholder:text-gray-300 transition-colors"
                  />
                  <p className="text-[10px] text-gray-300 mt-1">
                    {item.file ? '写真あり' : '写真未選択（タップで追加）'}
                  </p>
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="flex-shrink-0 w-7 h-7 rounded-full bg-gray-100 hover:bg-red-100 flex items-center justify-center transition-colors group"
                >
                  <svg
                    className="w-3.5 h-3.5 text-gray-400 group-hover:text-red-500 transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}

            {items.length < MAX_ITEMS && (
              <button
                type="button"
                onClick={addItem}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-gray-200 hover:border-red-300 text-sm text-gray-400 hover:text-red-500 transition-colors flex items-center justify-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                アイテムを追加
              </button>
            )}

            {items.length >= MAX_ITEMS && (
              <p className="text-xs text-gray-400 text-center">
                最大{MAX_ITEMS}件まで登録できます
              </p>
            )}
          </div>
        )}

        <GlassInput
          label="相談内容詳細"
          value={details}
          onChange={setDetails}
          rows={4}
          placeholder="ご質問やご要望があればご記入ください（任意）"
        />

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
              || !lastName.trim() || !firstName.trim() || !lastNameKana.trim() || !firstNameKana.trim() || !phone.trim()
              || !email.trim() || !postalCode.trim() || !address.trim()
              // CAPTCHAキー設定時のみトークンを必須にする
              || (!!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && !turnstileToken)
            }
          >
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
