'use client'

import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import LoadingSpinner from '@/components/LoadingSpinner'

type SettingItem = { href: string; title: string; desc: string; icon: string }

const ITEMS: SettingItem[] = [
  { href: '/admin/settings/google', title: 'Google連携・スプレッドシート', desc: 'Googleアカウント連携、ライセンスキー／お問い合わせシート、同期ログ', icon: '🔗' },
  { href: '/admin/settings/email', title: 'メール通知設定', desc: 'SMTPサーバー設定・テスト送信', icon: '✉️' },
  { href: '/admin/settings/analytics', title: 'Google Analytics', desc: 'アクセス解析のトラッキングID', icon: '📊' },
  { href: '/admin/settings/rakuten', title: '楽天商品検索API', desc: 'バーコード連携用のアプリケーションID', icon: '🛒' },
  { href: '/admin/settings/visit-statuses', title: '訪問ステータス管理', desc: '訪問スケジュールのステータス', icon: '🏷️' },
  { href: '/admin/settings/purchase-categories', title: '買取カテゴリ管理', desc: '買取品目のカテゴリ', icon: '📦' },
  { href: '/admin/settings/lead-sources', title: '流入経路管理', desc: '顧客の流入経路の選択肢（電話・LINE・紹介 など）', icon: '🧭' },
  { href: '/admin/settings/akiya-items', title: '空き家管理項目', desc: '空き家管理記録の点検項目マスタ（並び順・有効/無効）', icon: '🏠' },
  { href: '/admin/settings/payment', title: '決済カード', desc: '備品発注の決済に使うクレジットカード', icon: '💳' },
  { href: '/admin/settings/store-menu', title: '店舗メニュー設定', desc: '店舗ポータルのサイドメニューの並び順・表示/非表示（店舗ごとの特例も設定可）', icon: '🧩' },
]

export default function AdminSettingsIndexPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/admin/login')
    } else if (status === 'authenticated' && !['admin', 'superadmin', 'hr'].includes((session!.user as any).role)) {
      router.push('/')
    }
  }, [status, session, router])

  if (status !== 'authenticated') {
    return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  }

  return (
    <>
      <AppBar title="設定" />
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mb-5">
          設定したい項目を選択してください。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ITEMS.map(item => (
            <Link key={item.href} href={item.href} className="block group">
              <Card variant="elevated" padding="md" className="h-full transition-colors group-hover:bg-[var(--md-sys-color-surface-container-high)]">
                <div className="flex items-start gap-3">
                  <span className="text-2xl leading-none flex-shrink-0">{item.icon}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-0.5">{item.title}</h3>
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">{item.desc}</p>
                  </div>
                  <svg className="w-5 h-5 text-[var(--md-sys-color-outline)] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
