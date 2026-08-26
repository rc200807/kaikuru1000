'use client'

import { useState, useEffect } from 'react'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function PartnerLoginPage() {
  const router = useRouter()
  const { data: session, status } = useSession()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'authenticated' && (session?.user as any)?.role === 'partner') {
      // ログイン直後はハード遷移する。
      // SessionProvider がルート(providers.tsx)と各Shellで入れ子になっており、
      // next-auth の signIn が更新するのは片方だけ（__NEXTAUTH._getSession はモジュール変数で
      // 後からマウントした側に上書きされる）。画面が読むのはサーバー描画時のセッション＝
      // ログイン画面表示時点の null のままなので、router.push だと遷移先が未ログイン扱いになり
      // ログイン画面へ戻されていた（2回目で入れるのはその間にレイアウトが再取得されるため）。
      // ハード遷移ならサーバーが新しいCookieでレイアウトごと描き直すので確実に入れる。
      window.location.assign('/partner/license-keys')
    }
  }, [status, session, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const result = await signIn('partner', { redirect: false, email, password })
    setLoading(false)
    if (result?.error) {
      setError(result.error === 'CredentialsSignin' ? 'メールまたはパスワードが正しくありません' : result.error)
    } else if (result?.ok) {
      // ログイン直後はハード遷移する。
      // SessionProvider がルート(providers.tsx)と各Shellで入れ子になっており、
      // next-auth の signIn が更新するのは片方だけ（__NEXTAUTH._getSession はモジュール変数で
      // 後からマウントした側に上書きされる）。画面が読むのはサーバー描画時のセッション＝
      // ログイン画面表示時点の null のままなので、router.push だと遷移先が未ログイン扱いになり
      // ログイン画面へ戻されていた（2回目で入れるのはその間にレイアウトが再取得されるため）。
      // ハード遷移ならサーバーが新しいCookieでレイアウトごと描き直すので確実に入れる。
      window.location.assign('/partner/license-keys')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0a0a0a] text-[#ededed] p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-xl font-bold">セールスパートナー専用</h1>
          <p className="text-xs text-[#999] mt-1">買いクル管理ポータル</p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="bg-[#141414] rounded-2xl p-6 border border-[rgba(255,255,255,0.06)] space-y-4"
        >
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-[#a3a3a3] mb-1">パスワード</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-md bg-[#1a1a1a] border border-[rgba(255,255,255,0.08)] text-sm"
            />
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-md bg-white text-black font-semibold text-sm disabled:opacity-50"
          >
            {loading ? 'ログイン中…' : 'ログイン'}
          </button>
          <p className="text-[11px] text-[#666] text-center mt-2">
            まだアカウントをお持ちでない場合は、管理者から発行された招待リンクをご利用ください
          </p>
        </form>
      </div>
    </div>
  )
}
