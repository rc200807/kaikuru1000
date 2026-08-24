'use client'

import { SessionProvider } from 'next-auth/react'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    // ウィンドウフォーカスのたびに /api/auth/session を叩き直さない。
    // 1リクエスト0.3秒前後かかるうえ、パスキーセッションはサーバー側でDB照合も走るため
    // タブを行き来するだけで無駄な往復が積み上がっていた。
    // セッション切れはページ遷移時に middleware が、API は各ルートの getServerSession が弾く。
    // 店舗アカウント切替などの明示的な更新は update() を呼ぶので影響しない。
    <SessionProvider refetchOnWindowFocus={false} refetchInterval={0}>
      {children}
    </SessionProvider>
  )
}
