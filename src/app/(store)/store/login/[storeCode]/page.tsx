import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import { normalizeStoreStatus, storeStatusLabel } from '@/lib/store-status'
import StoreLoginForm from '@/components/store/StoreLoginForm'
import LoginFooter from '@/components/LoginFooter'

/**
 * 店舗専用ログイン画面。店舗ごとに配るURL（/store/login/S001）。
 *
 * 店舗を確定させたうえでログインさせるのが目的。メールアドレスは店舗内でのみ一意なので
 * （StoreMember の @@unique([storeId, email])）、同じアドレスが複数の店舗で使われうる。
 * この画面から入れば必ずその店舗のアカウントとして認証される。
 */
export default async function StoreCodeLoginPage({
  params,
}: {
  params: Promise<{ storeCode: string }>
}) {
  const { storeCode } = await params
  const store = await prisma.store.findUnique({
    where: { code: decodeURIComponent(storeCode) },
    select: { code: true, name: true, isActive: true, storeStatus: true },
  })

  const status = normalizeStoreStatus(store?.storeStatus)
  const unavailable = !store || !store.isActive || ['closed', 'transferred'].includes(status)

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-surface)] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img loading="lazy" decoding="async" src="/logo.svg" alt="買いクル" className="h-8 mx-auto" />
          </Link>
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-2">店舗スタッフ ログイン</p>
        </div>

        {unavailable ? (
          <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-lowest,#fff)] p-6 text-center">
            <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-1">
              {store ? `この店舗はログインできません（${storeStatusLabel(store.storeStatus)}）` : '店舗が見つかりません'}
            </p>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-4">
              URLをご確認いただくか、店舗を選び直してください。
            </p>
            <Link href="/store/login" className="text-sm text-[var(--portal-primary)] hover:underline">
              店舗を選んでログイン →
            </Link>
          </div>
        ) : (
          <StoreLoginForm store={{ code: store.code, name: store.name }} />
        )}

        <LoginFooter />
      </div>
    </div>
  )
}
