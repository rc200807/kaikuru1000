'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function RegisterPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

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

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setFormData({ ...formData, [e.target.name]: e.target.value })
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.passwordConfirm) {
      setError('パスワードが一致しません')
      return
    }

    if (formData.password.length < 8) {
      setError('パスワードは8文字以上で入力してください')
      return
    }

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
    setLoading(false)

    if (!res.ok) {
      setError(data.error || '登録に失敗しました')
      return
    }

    setStep(3)
  }

  if (step === 3) {
    return (
      <div className="min-h-screen bg-[#FFFBFE] flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-5">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-3">登録完了</h2>
            <p className="text-sm text-gray-500 mb-7 leading-relaxed">
              会員登録が完了しました。<br />
              担当店舗が決まり次第、ご連絡いたします。
            </p>
            <Link
              href="/login"
              className="block bg-red-700 text-white py-3 rounded-full text-sm font-medium hover:bg-red-800 transition-colors"
            >
              ログインする
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FFFBFE] flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-bold text-red-700 tracking-tight">買いクル</Link>
          <p className="text-sm text-gray-500 mt-2">新規会員登録</p>
        </div>

        {/* ステップ表示 */}
        <div className="flex items-center justify-center mb-8 gap-4">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-medium text-sm
                ${step >= s ? 'bg-red-700 text-white' : 'bg-gray-200 text-gray-500'}`}>
                {s}
              </div>
              {s < 2 && <div className={`w-16 h-0.5 mx-2 ${step > s ? 'bg-red-700' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-28 text-xs text-gray-400 mb-8 -mt-4">
          <span>ライセンス確認</span>
          <span>基本情報</span>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-6 text-sm">
              {error}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <h3 className="text-base font-semibold text-gray-900">ライセンスキーの確認</h3>
              <p className="text-sm text-gray-500">
                担当者からお渡しされたライセンスキーを入力してください。
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  ライセンスキー <span className="text-red-600">*</span>
                </label>
                <input
                  type="text"
                  name="licenseKey"
                  value={formData.licenseKey}
                  onChange={handleChange}
                  required
                  placeholder="KK-2024-XXXX-0000"
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-700 font-mono"
                />
              </div>
              <button
                onClick={() => {
                  if (!formData.licenseKey.trim()) {
                    setError('ライセンスキーを入力してください')
                    return
                  }
                  setStep(2)
                }}
                className="w-full bg-red-700 text-white py-3 rounded-full text-sm font-medium hover:bg-red-800 transition-colors"
              >
                次へ
              </button>
            </div>
          )}

          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <h3 className="text-base font-semibold text-gray-900">基本情報の入力</h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    氏名 <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text" name="name" value={formData.name}
                    onChange={handleChange} required
                    placeholder="山田 太郎"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-700"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    ふりがな <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="text" name="furigana" value={formData.furigana}
                    onChange={handleChange} required
                    placeholder="やまだ たろう"
                    className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-700"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  メールアドレス <span className="text-red-600">*</span>
                </label>
                <input
                  type="email" name="email" value={formData.email}
                  onChange={handleChange} required
                  placeholder="example@email.com"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-700"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  電話番号 <span className="text-red-600">*</span>
                </label>
                <input
                  type="tel" name="phone" value={formData.phone}
                  onChange={handleChange} required
                  placeholder="090-0000-0000"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-700"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  訪問先住所 <span className="text-red-600">*</span>
                </label>
                <input
                  type="text" name="address" value={formData.address}
                  onChange={handleChange} required
                  placeholder="東京都渋谷区..."
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-700"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  パスワード <span className="text-red-600">*</span>
                </label>
                <input
                  type="password" name="password" value={formData.password}
                  onChange={handleChange} required minLength={8}
                  placeholder="8文字以上"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-700"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  パスワード（確認） <span className="text-red-600">*</span>
                </label>
                <input
                  type="password" name="passwordConfirm" value={formData.passwordConfirm}
                  onChange={handleChange} required
                  placeholder="パスワードを再入力"
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-700"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="flex-1 border border-gray-300 text-gray-700 py-3 rounded-full text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  戻る
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-red-700 text-white py-3 rounded-full text-sm font-medium hover:bg-red-800 transition-colors disabled:opacity-50"
                >
                  {loading ? '登録中...' : '登録する'}
                </button>
              </div>
            </form>
          )}
        </div>

        <p className="text-center mt-5 text-sm text-gray-500">
          すでにアカウントをお持ちの方は{' '}
          <Link href="/login" className="text-red-700 font-medium hover:underline">
            ログイン
          </Link>
        </p>
      </div>
    </div>
  )
}
