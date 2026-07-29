import Link from 'next/link'

/**
 * 店舗／管理者ログイン画面共通のフッター。
 * 特定商取引法に基づく表記（/legal/tokushoho）への導線を含む。
 */
export default function LoginFooter() {
  return (
    <footer className="mt-5 text-center text-sm text-[var(--md-sys-color-on-surface-variant)]">
      <nav className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <Link href="/" className="hover:text-[var(--md-sys-color-on-surface)] transition-colors">
          ← トップページへ
        </Link>
        <span aria-hidden="true" className="text-[var(--md-sys-color-outline-variant)]">|</span>
        <Link
          href="/legal/tokushoho"
          className="hover:text-[var(--md-sys-color-on-surface)] transition-colors"
        >
          特定商取引法に基づく表記
        </Link>
      </nav>
      <p className="mt-3 text-xs text-[var(--md-sys-color-on-surface-variant)]">
        © OrderDesignStudio株式会社
      </p>
    </footer>
  )
}
