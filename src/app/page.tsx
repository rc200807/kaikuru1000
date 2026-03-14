import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface-container-lowest,#FFFBFE)] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">
        {/* Brand */}
        <h1 className="text-4xl font-bold text-[#B91C1C] tracking-tight mb-1">
          買いクル
        </h1>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant,#49454F)] mb-10">
          出張買取サービス
        </p>

        {/* Customer portal card */}
        <Link href="/login" className="group block">
          <div
            className="
              bg-[var(--md-sys-color-surface-container-lowest,#fff)]
              border border-[var(--md-sys-color-outline-variant,#CAC4D0)]
              rounded-[var(--md-sys-shape-medium,12px)]
              p-8 text-center
              shadow-[var(--md-sys-elevation-1)]
              hover:shadow-[var(--md-sys-elevation-2)]
              transition-shadow duration-200
            "
          >
            <div className="w-14 h-14 rounded-full bg-[#FEE2E2] flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-[#B91C1C]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-[var(--md-sys-color-on-surface,#1C1B1F)] mb-1.5">
              顧客マイページ
            </h2>
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant,#49454F)]">
              訪問予定・プロフィールの確認
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
