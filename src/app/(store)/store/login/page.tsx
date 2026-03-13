'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Card from '@/components/Card'
import TextField from '@/components/TextField'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'

export default function StoreLoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const result = await signIn('store', {
      email, password,
      redirect: false,
    })

    setLoading(false)

    if (result?.error) {
      setError('メールアドレスまたはパスワードが間違っています')
    } else {
      router.push('/store/customers')
    }
  }

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-bold text-[var(--portal-primary)] tracking-tight">
            買いクル
          </Link>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-2">店舗スタッフ ログイン</p>
        </div>

        <Card variant="elevated" padding="lg">
          <div className="mb-6">
            <p className="text-xs font-medium text-[var(--portal-primary)] tracking-widest uppercase mb-1">Store Portal</p>
            <p className="text-base font-semibold text-[var(--md-sys-color-on-surface)]">店舗ポータル</p>
          </div>

          {error && (
            <MessageBanner severity="error" className="mb-6">
              {error}
            </MessageBanner>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <TextField
              label="店舗メールアドレス"
              type="email"
              value={email}
              onChange={setEmail}
              required
              placeholder="store@kaikuru.jp"
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
