'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Card from '@/components/Card'
import TextField from '@/components/TextField'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'
import PasskeyLoginButton from '@/components/PasskeyLoginButton'

export default function AdminLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('admin', {
      email, password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError('メールアドレスまたはパスワードが間違っています')
    } else {
      router.push('/admin/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            <img src="/logo.svg" alt="買いクル" className="h-8 mx-auto dark:hidden" />
            <img src="/logo-white.svg" alt="買いクル" className="h-8 mx-auto hidden dark:block" />
          </Link>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-2">本部管理者ログイン</p>
        </div>

        <Card variant="elevated" padding="lg">
          <div className="mb-6">
            <p className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] tracking-widest uppercase mb-1">
              Admin Portal
            </p>
            <p className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">管理者ポータル</p>
          </div>

          {error && (
            <MessageBanner severity="error" className="mb-6">
              {error}
            </MessageBanner>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <TextField
              label="メールアドレス または ログインID"
              type="text"
              value={email}
              onChange={setEmail}
              required
              placeholder="admin@kaikuru.jp"
            />
            <TextField
              label="パスワード"
              type="password"
              value={password}
              onChange={setPassword}
              required
            />
            <Button
              type="submit"
              disabled={loading}
              loading={loading}
              fullWidth
              size="lg"
            >
              {loading ? 'ログイン中...' : 'ログイン'}
            </Button>
          </form>

          <div className="mt-4">
            <PasskeyLoginButton portal="admin" callbackUrl="/admin/dashboard" onError={setError} />
          </div>

          <div className="text-center mt-4 pt-4 border-t border-[var(--md-sys-color-outline-variant)]">
            <Link
              href="/admin/forgot-password"
              className="text-sm text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
            >
              パスワードを忘れた方はこちら
            </Link>
          </div>
        </Card>

        <p className="text-center mt-5 text-sm text-[var(--md-sys-color-on-surface-variant)]">
          <Link href="/" className="hover:text-[var(--md-sys-color-on-surface)] transition-colors">
            ← トップページへ
          </Link>
        </p>
      </div>
    </div>
  )
}
