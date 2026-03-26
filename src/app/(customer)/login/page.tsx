'use client'

import { useState, lazy, Suspense } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import MessageBanner from '@/components/MessageBanner'

const GlassOrbs3D = lazy(() => import('@/components/GlassOrbs3D'))

export default function CustomerLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPw, setShowPw] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetMessage, setResetMessage] = useState('')

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault()
    setResetLoading(true)
    setResetMessage('')
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, userType: 'customer' }),
      })
      setResetMessage('パスワードリセット用のメールを送信しました')
    } catch {
      setResetMessage('エラーが発生しました。もう一度お試しください')
    } finally {
      setResetLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('customer', {
      email, password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError('メールアドレス（または電話番号）かパスワードが間違っています')
    } else {
      router.push('/mypage')
    }
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">

      {/* WebGL 3D Glass Orbs Background */}
      <Suspense fallback={null}>
        <GlassOrbs3D />
      </Suspense>

      {/* Glass login card */}
      <div className="relative w-full max-w-md z-10">
        <div className="bg-white/40 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-red-900/5 border border-white/60 p-8 sm:p-10">
          {/* Logo / Title */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-red-700 to-rose-500 bg-clip-text text-transparent">
              エコ得BOX
            </h1>
            <p className="text-sm text-gray-500 mt-1">アカウントにログイン</p>
          </div>

          {error && (
            <div className="mb-6">
              <MessageBanner severity="error">{error}</MessageBanner>
            </div>
          )}

          {showForgotPassword ? (
            <div className="space-y-5">
              {resetMessage ? (
                <MessageBanner severity="success">{resetMessage}</MessageBanner>
              ) : (
                <form onSubmit={handleForgotPassword} className="space-y-5">
                  <p className="text-sm text-gray-500">
                    登録済みのメールアドレスを入力してください。パスワードリセット用のリンクをお送りします。
                  </p>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">メールアドレス</label>
                    <div className="relative group">
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-red-300/40 to-rose-300/40 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
                      <div className="relative">
                        <input
                          type="email"
                          value={resetEmail}
                          onChange={e => setResetEmail(e.target.value)}
                          required
                          placeholder="example@email.com"
                          className="w-full px-4 py-3.5 bg-white/50 backdrop-blur-lg rounded-2xl border border-white/60 shadow-inner shadow-white/30 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-red-300/60 focus:bg-white/60 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-500 text-white font-semibold text-sm shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/30 hover:from-red-700 hover:to-rose-600 active:scale-[0.98] transition-all disabled:opacity-60"
                  >
                    {resetLoading ? '送信中...' : 'リセットメールを送信'}
                  </button>
                </form>
              )}
              <button
                type="button"
                onClick={() => { setShowForgotPassword(false); setResetMessage('') }}
                className="text-sm text-gray-500 hover:text-gray-700 transition-colors w-full text-center"
              >
                ← ログインに戻る
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">メールアドレスまたは電話番号</label>
                    <div className="relative group">
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-red-300/40 to-rose-300/40 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
                      <div className="relative">
                        <input
                          type="text"
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          required
                          placeholder="example@email.com / 09012345678"
                          className="w-full px-4 py-3.5 bg-white/50 backdrop-blur-lg rounded-2xl border border-white/60 shadow-inner shadow-white/30 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-red-300/60 focus:bg-white/60 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 ml-1">パスワード</label>
                    <div className="relative group">
                      <div className="absolute -inset-0.5 bg-gradient-to-r from-red-300/40 to-rose-300/40 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
                      <div className="relative">
                        <input
                          type={showPw ? 'text' : 'password'}
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          required
                          placeholder="パスワードを入力"
                          className="w-full px-4 py-3.5 bg-white/50 backdrop-blur-lg rounded-2xl border border-white/60 shadow-inner shadow-white/30 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:border-red-300/60 focus:bg-white/60 transition-all pr-12"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPw(!showPw)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                        >
                          {showPw ? (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                          ) : (
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-red-600 to-rose-500 text-white font-semibold text-sm shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/30 hover:from-red-700 hover:to-rose-600 active:scale-[0.98] transition-all disabled:opacity-60"
                >
                  {loading ? 'ログイン中...' : 'ログイン'}
                </button>
              </form>

              <div className="text-center mt-5">
                <button
                  type="button"
                  onClick={() => setShowForgotPassword(true)}
                  className="text-sm text-red-500/80 hover:text-red-600 transition-colors"
                >
                  パスワードをお忘れですか？
                </button>
              </div>

              <div className="mt-5 space-y-3">
                <Link
                  href="/register"
                  className="block w-full text-center py-3 rounded-2xl bg-white/50 backdrop-blur-sm border border-white/80 text-red-600 font-medium text-sm hover:bg-white/70 transition-all active:scale-[0.98]"
                >
                  ライセンスキーを使って新規登録
                </Link>
                <p className="text-center text-xs text-gray-400">
                  ライセンスキーをお持ちでない方は{' '}
                  <Link href="/register-regular" className="text-red-500/80 font-medium hover:underline">
                    通常会員登録
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>

    </div>
  )
}
