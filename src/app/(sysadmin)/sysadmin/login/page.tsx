'use client'

import { useEffect, useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { browserSupportsWebAuthn } from '@simplewebauthn/browser'
import { loginWithPasskey } from '@/components/PasskeyLoginButton'

export default function SysAdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [passkeySupported, setPasskeySupported] = useState(false)
  const [passkeyLoading, setPasskeyLoading] = useState(false)

  useEffect(() => {
    setPasskeySupported(browserSupportsWebAuthn())
  }, [])

  async function handlePasskeyLogin() {
    setError('')
    setPasskeyLoading(true)
    const result = await loginWithPasskey('sysadmin')
    setPasskeyLoading(false)
    if (result.ok) {
      router.push('/sysadmin/dashboard')
    } else if (!result.cancelled) {
      setError(result.error || 'パスキーログインに失敗しました')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('sysadmin', {
      email,
      password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError('メールアドレスまたはパスワードが間違っています')
    } else {
      router.push('/sysadmin/dashboard')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0a0a0a' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/icon.svg" alt="買いクル" className="w-12 h-12 mx-auto rounded-xl brightness-0 invert" />
          <p className="text-xs font-medium text-[#666666] tracking-widest uppercase mt-4">System Administrator</p>
          <p className="text-base font-semibold text-[#ededed] mt-1">システム管理者ログイン</p>
        </div>

        <div className="rounded-2xl p-6" style={{ background: '#141414', boxShadow: '0 0 0 1px rgba(255,255,255,0.08)' }}>
          {error && (
            <div className="mb-5 rounded-lg px-3 py-2.5 text-sm" style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="block text-xs text-[#a3a3a3] mb-1.5">メールアドレス</span>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="username"
                className="w-full rounded-lg px-3 py-2.5 text-sm text-[#ededed] outline-none"
                style={{ background: '#0a0a0a', boxShadow: '0 0 0 1px rgba(255,255,255,0.1)' }}
              />
            </label>
            <label className="block">
              <span className="block text-xs text-[#a3a3a3] mb-1.5">パスワード</span>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full rounded-lg px-3 py-2.5 text-sm text-[#ededed] outline-none"
                style={{ background: '#0a0a0a', boxShadow: '0 0 0 1px rgba(255,255,255,0.1)' }}
              />
            </label>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
              style={{ background: '#ffffff', color: '#0a0a0a' }}
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>

          {passkeySupported && (
            <button
              type="button"
              disabled={passkeyLoading}
              onClick={handlePasskeyLogin}
              className="w-full rounded-lg py-2.5 text-sm font-semibold mt-3 transition-opacity disabled:opacity-60 text-[#ededed]"
              style={{ background: '#0a0a0a', boxShadow: '0 0 0 1px rgba(255,255,255,0.15)' }}
            >
              {passkeyLoading ? '認証中...' : 'パスキーでログイン（30日間有効）'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
