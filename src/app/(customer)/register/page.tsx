'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import MessageBanner from '@/components/MessageBanner'
import { validatePassword, PASSWORD_RULE } from '@/lib/passwordValidation'
import { convertToJpegIfNeeded } from '@/lib/image-utils'
import GlassBackground from '@/components/customer/GlassBackground'
import GlassInput from '@/components/customer/GlassInput'
import GlassButton from '@/components/customer/GlassButton'

const DOC_TYPES = [
  { value: '運転免許証', label: '運転免許証（裏面も必要）' },
  { value: 'マイナンバーカード', label: 'マイナンバーカード（表面のみ）' },
  { value: 'パスポート', label: 'パスポート' },
  { value: '健康保険証', label: '健康保険証' },
  { value: '在留カード', label: '在留カード' },
  { value: 'その他', label: 'その他' },
]
const DOC_TYPES_REQUIRING_BACK = ['運転免許証']

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const [formData, setFormData] = useState({
    licenseKey: '',
    name: '',
    furigana: '',
    email: '',
    phone: '',
    address: '',
    password: '',
    passwordConfirm: '',
  })

  // 登録済みユーザーID（身分証アップロード用）
  const [registeredUserId, setRegisteredUserId] = useState<string | null>(null)

  // 身分証アップロード state
  const [selectedDocType, setSelectedDocType] = useState('')
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const [frontPreview, setFrontPreview] = useState('')
  const [backFile, setBackFile] = useState<File | null>(null)
  const [backPreview, setBackPreview] = useState('')
  const frontInputRef = useRef<HTMLInputElement>(null)
  const backInputRef = useRef<HTMLInputElement>(null)
  const [uploadingDoc, setUploadingDoc] = useState(false)

  const needsBackImage = DOC_TYPES_REQUIRING_BACK.includes(selectedDocType)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.passwordConfirm) {
      setError('パスワードが一致しません')
      return
    }

    const pwErr = validatePassword(formData.password)
    if (pwErr) { setError(pwErr); return }

    setLoading(true)

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: formData.name,
        furigana: formData.furigana,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        password: formData.password,
        licenseKey: formData.licenseKey,
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      setLoading(false)
      setError(data.error || '登録に失敗しました')
      return
    }

    // 自動サインインして身分証アップロードへ
    const signInResult = await signIn('customer', {
      email: formData.email,
      password: formData.password,
      redirect: false,
    })

    setLoading(false)

    setRegisteredUserId(data.id)

    if (signInResult?.error) {
      // サインイン失敗時はスキップして完了画面へ（ログインページから入り直し）
      setInfo('登録は完了しましたが自動ログインに失敗しました。ログイン後に身分証明書をアップロードしてください。')
      setStep(4)
      return
    }

    setStep(3)
  }

  async function handleFileSelect(
    e: React.ChangeEvent<HTMLInputElement>,
    side: 'front' | 'back'
  ) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setError('ファイルサイズは10MB以下にしてください')
      return
    }
    setError('')
    const converted = await convertToJpegIfNeeded(file)
    if (side === 'front') {
      setFrontFile(converted)
      setFrontPreview(URL.createObjectURL(converted))
    } else {
      setBackFile(converted)
      setBackPreview(URL.createObjectURL(converted))
    }
  }

  async function handleSubmitIdDocument() {
    if (!registeredUserId || !frontFile || !selectedDocType) return
    setError('')
    setUploadingDoc(true)

    const formDataUpload = new FormData()
    formDataUpload.append('file', frontFile)
    formDataUpload.append('documentType', selectedDocType)

    const res = await fetch(`/api/users/${registeredUserId}/id-document`, {
      method: 'POST',
      body: formDataUpload,
    })

    if (!res.ok) {
      setUploadingDoc(false)
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'アップロードに失敗しました')
      return
    }

    // 裏面（必要な場合）
    if (backFile && needsBackImage) {
      const backFormData = new FormData()
      backFormData.append('file', backFile)
      backFormData.append('documentType', selectedDocType)
      await fetch(`/api/users/${registeredUserId}/id-document/back`, {
        method: 'POST',
        body: backFormData,
      })
    }

    setUploadingDoc(false)
    setInfo('登録および身分証明書のアップロードが完了しました。')
    setStep(4)
  }

  function handleSkipIdDocument() {
    setInfo('登録は完了しました。身分証明書はマイページから後でアップロードできます。')
    setStep(4)
  }

  // Step 4: 完了
  if (step === 4) {
    return (
      <GlassBackground>
        <div className="text-center">
          <div className="w-16 h-16 bg-green-100/80 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-800 mb-3">
            登録完了
          </h2>
          <p className="text-sm text-gray-500 mb-7 leading-relaxed whitespace-pre-line">
            {info || '会員登録が完了しました。\n担当店舗が決まり次第、ご連絡いたします。'}
          </p>
          <GlassButton variant="primary" onClick={() => router.push(registeredUserId ? '/mypage' : '/login')}>
            {registeredUserId ? 'マイページへ' : 'ログインする'}
          </GlassButton>
        </div>
      </GlassBackground>
    )
  }

  const steps = [
    { num: 1, label: 'ライセンス確認' },
    { num: 2, label: '基本情報' },
    { num: 3, label: '身分証登録' },
  ]

  return (
    <GlassBackground maxWidth="max-w-lg">
      {/* Title */}
      <div className="text-center mb-6">
        <img src="/logo.svg" alt="買いクル" className="h-10 mx-auto mb-2" />
        <p className="text-sm text-gray-500 mt-1">新規登録</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-center mb-6 gap-4">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`
                  w-9 h-9 rounded-full flex items-center justify-center font-medium text-sm transition-colors duration-200
                  ${step >= s.num
                    ? 'bg-gradient-to-r from-red-600 to-rose-500 text-white shadow-md shadow-red-500/20'
                    : 'bg-white/50 text-gray-400 border border-white/60'
                  }
                `}
              >
                {step > s.num ? (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  s.num
                )}
              </div>
              <span className="text-xs text-gray-500 mt-1.5">
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`
                  w-12 h-0.5 mx-2 -mt-5 transition-colors duration-200
                  ${step > s.num
                    ? 'bg-gradient-to-r from-red-500 to-rose-400'
                    : 'bg-white/60'
                  }
                `}
              />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-6">
          <MessageBanner severity="error">{error}</MessageBanner>
        </div>
      )}

      {/* Step 1: License key */}
      {step === 1 && (
        <div className="space-y-5">
          <div>
            <h3 className="text-base font-semibold text-gray-700 mb-1">
              エコ得BOX ライセンスキーの確認
            </h3>
            <p className="text-sm text-gray-500">
              担当者からお渡しされたライセンスキーを入力してください。
            </p>
          </div>

          <GlassInput
            label="ライセンスキー"
            value={formData.licenseKey}
            onChange={(val) => { setFormData({ ...formData, licenseKey: val }); setError('') }}
            required
            placeholder="KK-2024-XXXX-0000"
          />

          <GlassButton
            variant="primary"
            onClick={() => {
              if (!formData.licenseKey.trim()) {
                setError('ライセンスキーを入力してください')
                return
              }
              setStep(2)
            }}
          >
            次へ
          </GlassButton>
        </div>
      )}

      {/* Step 2: Personal info */}
      {step === 2 && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <h3 className="text-base font-semibold text-gray-700 mb-2">
            基本情報の入力
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <GlassInput
              label="氏名"
              value={formData.name}
              onChange={(val) => { setFormData({ ...formData, name: val }); setError('') }}
              required
              placeholder="山田 太郎"
            />
            <GlassInput
              label="ふりがな"
              value={formData.furigana}
              onChange={(val) => { setFormData({ ...formData, furigana: val }); setError('') }}
              required
              placeholder="やまだ たろう"
            />
          </div>

          <GlassInput
            label="メールアドレス"
            type="email"
            value={formData.email}
            onChange={(val) => { setFormData({ ...formData, email: val }); setError('') }}
            required
            placeholder="example@email.com"
          />

          <GlassInput
            label="電話番号"
            type="tel"
            value={formData.phone}
            onChange={(val) => { setFormData({ ...formData, phone: val }); setError('') }}
            required
            placeholder="090-0000-0000"
          />

          <GlassInput
            label="訪問先住所"
            value={formData.address}
            onChange={(val) => { setFormData({ ...formData, address: val }); setError('') }}
            required
            placeholder="東京都渋谷区..."
          />

          <GlassInput
            label="パスワード"
            type="password"
            value={formData.password}
            onChange={(val) => { setFormData({ ...formData, password: val }); setError('') }}
            required
            placeholder={PASSWORD_RULE}
          />

          <GlassInput
            label="パスワード（確認）"
            type="password"
            value={formData.passwordConfirm}
            onChange={(val) => { setFormData({ ...formData, passwordConfirm: val }); setError('') }}
            required
            placeholder="パスワードを再入力"
          />

          <div className="flex gap-3 pt-2">
            <GlassButton variant="secondary" onClick={() => setStep(1)}>
              戻る
            </GlassButton>
            <GlassButton type="submit" variant="primary" disabled={loading} loading={loading}>
              {loading ? '登録中...' : '登録する'}
            </GlassButton>
          </div>
        </form>
      )}

      {/* Step 3: ID Document */}
      {step === 3 && (
        <div className="space-y-5">
          <div>
            <h3 className="text-base font-semibold text-gray-700 mb-1">
              身分証明書の登録
            </h3>
            <p className="text-sm text-gray-500">
              買取サービスのご利用には身分証明書の登録が必要です。<br />
              （後でマイページからも登録できます）
            </p>
          </div>

          {/* 書類種別 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              書類の種類
            </label>
            <select
              value={selectedDocType}
              onChange={(e) => { setSelectedDocType(e.target.value); setError('') }}
              className="w-full px-3 py-2.5 text-sm bg-white/50 border border-white/60 rounded-lg backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-red-400/50"
            >
              <option value="">選択してください</option>
              {DOC_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* 表面 */}
          {selectedDocType && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                {needsBackImage ? '表面の画像' : '画像'}
              </label>
              <input
                ref={frontInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleFileSelect(e, 'front')}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => frontInputRef.current?.click()}
                className="w-full px-3 py-2.5 text-sm bg-white/50 border border-white/60 border-dashed rounded-lg hover:bg-white/70 transition-colors text-gray-700"
              >
                {frontFile ? `選択済: ${frontFile.name}` : '画像を選択'}
              </button>
              {frontPreview && (
                <img src={frontPreview} alt="表面プレビュー" className="mt-2 max-h-40 rounded-md border border-white/60" />
              )}
            </div>
          )}

          {/* 裏面 */}
          {selectedDocType && needsBackImage && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">
                裏面の画像
              </label>
              <input
                ref={backInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleFileSelect(e, 'back')}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => backInputRef.current?.click()}
                className="w-full px-3 py-2.5 text-sm bg-white/50 border border-white/60 border-dashed rounded-lg hover:bg-white/70 transition-colors text-gray-700"
              >
                {backFile ? `選択済: ${backFile.name}` : '画像を選択'}
              </button>
              {backPreview && (
                <img src={backPreview} alt="裏面プレビュー" className="mt-2 max-h-40 rounded-md border border-white/60" />
              )}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <GlassButton variant="secondary" onClick={handleSkipIdDocument} disabled={uploadingDoc}>
              スキップ
            </GlassButton>
            <GlassButton
              variant="primary"
              onClick={handleSubmitIdDocument}
              disabled={uploadingDoc || !selectedDocType || !frontFile || (needsBackImage && !backFile)}
              loading={uploadingDoc}
            >
              {uploadingDoc ? 'アップロード中...' : 'アップロード'}
            </GlassButton>
          </div>
        </div>
      )}

      {/* Login link */}
      {step !== 3 && (
        <div className="text-center mt-5">
          <p className="text-sm text-gray-500">
            すでにアカウントをお持ちの方は{' '}
            <Link href="/login" className="text-red-500/80 hover:text-red-600 font-medium">
              ログイン
            </Link>
          </p>
        </div>
      )}
    </GlassBackground>
  )
}
