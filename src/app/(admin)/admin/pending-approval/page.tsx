'use client'

// ID+パスワード方式アカウントの承認待ちページ。
// superadmin が承認すると status が active になる。ポーリングで検知し再ログインを促す。
import { useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'
import Card from '@/components/Card'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'

export default function AdminPendingApprovalPage() {
  const [approved, setApproved] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const res = await fetch('/api/admin/me/status')
        if (!res.ok || cancelled) return
        const data = await res.json()
        if (data.status === 'active') setApproved(true)
      } catch { /* 次回ポーリングで回復 */ }
    }
    check()
    const timer = setInterval(() => { if (!document.hidden) check() }, 10_000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.svg" alt="買いクル" className="h-8 mx-auto dark:hidden" />
          <img src="/logo-white.svg" alt="買いクル" className="h-8 mx-auto hidden dark:block" />
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-2">承認待ち</p>
        </div>

        <Card variant="elevated" padding="lg">
          {approved ? (
            <>
              <MessageBanner severity="success" className="mb-4">
                アカウントが承認されました。再ログインすると利用を開始できます。
              </MessageBanner>
              <Button type="button" fullWidth size="lg" onClick={() => signOut({ callbackUrl: '/admin/login' })}>
                ログイン画面へ
              </Button>
            </>
          ) : (
            <>
              <h1 className="text-base font-semibold text-[var(--md-sys-color-on-surface)] mb-2">
                管理者の承認をお待ちください
              </h1>
              <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5">
                パスキーの登録が完了しました。アカウントの利用開始には、システム管理者（superadmin）の承認が必要です。
                承認されると自動で下のボタンからログインできるようになります。
              </p>
              <div className="flex items-center gap-2 text-sm text-[var(--md-sys-color-on-surface-variant)]">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                承認を確認中…
              </div>
              <div className="text-center mt-5 pt-4 border-t border-[var(--md-sys-color-outline-variant)]">
                <button
                  type="button"
                  onClick={() => signOut({ callbackUrl: '/admin/login' })}
                  className="text-sm text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)] transition-colors"
                >
                  ログアウト
                </button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  )
}
