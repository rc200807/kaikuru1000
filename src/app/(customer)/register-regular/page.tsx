'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import MessageBanner from '@/components/MessageBanner'
import { validatePassword, PASSWORD_RULE } from '@/lib/passwordValidation'
import GlassBackground from '@/components/customer/GlassBackground'
import GlassInput from '@/components/customer/GlassInput'
import GlassButton from '@/components/customer/GlassButton'

export default function RegisterRegularPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const [formData, setFormData] = useState({
    lastName: '',
    firstName: '',
    lastNameKana: '',
    firstNameKana: '',
    email: '',
    phone: '',
    address: '',
    password: '',
    passwordConfirm: '',
  })

  function handleChange(field: string, val: string) {
    setFormData({ ...formData, [field]: val })
    setError('')
  }

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
        lastName: formData.lastName,
        firstName: formData.firstName,
        lastNameKana: formData.lastNameKana,
        firstNameKana: formData.firstNameKana,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
        password: formData.password,
        customerType: 'regular',
      }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error || '登録に失敗しました')
      return
    }

    setDone(true)
  }

  // 登録完了画面
  if (done) {
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
          <p className="text-sm text-gray-500 mb-7 leading-relaxed">
            会員登録が完了しました。<br />
            担当店舗が決まり次第、ご連絡いたします。
          </p>
          <GlassButton variant="primary" onClick={() => router.push('/login')}>
            ログインする
          </GlassButton>
        </div>
      </GlassBackground>
    )
  }

  return (
    <GlassBackground maxWidth="max-w-lg">
      {/* Title */}
      <div className="text-center mb-6">
        <img loading="lazy" decoding="async" src="/logo.svg" alt="買いクル" className="h-10 mx-auto mb-2" />
        <p className="text-sm text-gray-500 mt-1">通常会員 新規登録</p>
      </div>

      {error && (
        <div className="mb-6">
          <MessageBanner severity="error">{error}</MessageBanner>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <h3 className="text-base font-semibold text-gray-700 mb-1">
            基本情報の入力
          </h3>
          <p className="text-sm text-gray-500">
            ライセンスキーは不要です。以下の情報を入力してください。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <GlassInput
            label="姓"
            value={formData.lastName}
            onChange={(val) => handleChange('lastName', val)}
            required
            placeholder="山田"
          />
          <GlassInput
            label="名"
            value={formData.firstName}
            onChange={(val) => handleChange('firstName', val)}
            required
            placeholder="太郎"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <GlassInput
            label="せい（ふりがな）"
            value={formData.lastNameKana}
            onChange={(val) => handleChange('lastNameKana', val)}
            required
            placeholder="やまだ"
          />
          <GlassInput
            label="めい（ふりがな）"
            value={formData.firstNameKana}
            onChange={(val) => handleChange('firstNameKana', val)}
            required
            placeholder="たろう"
          />
        </div>

        <GlassInput
          label="メールアドレス"
          type="email"
          value={formData.email}
          onChange={(val) => handleChange('email', val)}
          required
          placeholder="example@email.com"
        />

        <GlassInput
          label="電話番号"
          type="tel"
          value={formData.phone}
          onChange={(val) => handleChange('phone', val)}
          required
          placeholder="090-0000-0000"
        />

        <GlassInput
          label="住所"
          value={formData.address}
          onChange={(val) => handleChange('address', val)}
          required
          placeholder="東京都渋谷区..."
        />

        <GlassInput
          label="パスワード"
          type="password"
          value={formData.password}
          onChange={(val) => handleChange('password', val)}
          required
          placeholder={PASSWORD_RULE}
        />

        <GlassInput
          label="パスワード（確認）"
          type="password"
          value={formData.passwordConfirm}
          onChange={(val) => handleChange('passwordConfirm', val)}
          required
          placeholder="パスワードを再入力"
        />

        <div className="pt-2">
          <GlassButton type="submit" variant="primary" disabled={loading} loading={loading}>
            {loading ? '登録中...' : '登録する'}
          </GlassButton>
        </div>
      </form>

      {/* Links */}
      <div className="text-center mt-5 space-y-2">
        <p className="text-sm text-gray-500">
          ライセンスキーをお持ちの方は{' '}
          <Link href="/register" className="text-red-500/80 hover:text-red-600 font-medium">
            こちら
          </Link>
        </p>
        <p className="text-sm text-gray-500">
          すでにアカウントをお持ちの方は{' '}
          <Link href="/login" className="text-red-500/80 hover:text-red-600 font-medium">
            ログイン
          </Link>
        </p>
      </div>
    </GlassBackground>
  )
}
