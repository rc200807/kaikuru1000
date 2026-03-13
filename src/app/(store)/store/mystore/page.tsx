'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import SummaryCard from '@/components/SummaryCard'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmptyState from '@/components/EmptyState'

type StoreInfo = {
  id: string
  name: string
  code: string
  phone: string | null
  address: string | null
  prefecture: string | null
  email: string | null
  isActive: boolean
  createdAt: string
  _count: { customers: number; visitSchedules: number }
}

export default function MyStorePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [store, setStore] = useState<StoreInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      const storeId = (session.user as any).id
      fetch(`/api/stores/${storeId}`)
        .then(async r => {
          if (!r.ok) { setLoading(false); return }
          const data = await r.json()
          setStore(data)
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }
  }, [status, session])

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  }

  return (
    <>
      <AppBar title="店舗情報" />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {store ? (
          <div className="space-y-6">
            {/* ステータスバナー */}
            <Card
              variant={store.isActive ? 'filled' : 'outlined'}
              padding="md"
              className={store.isActive
                ? 'bg-[var(--status-completed-bg)] border border-[var(--status-completed-text)]/20'
                : 'bg-[var(--status-absent-bg)] border border-[var(--status-absent-text)]/20'
              }
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                  store.isActive ? 'bg-[var(--status-completed-text)]/15' : 'bg-[var(--status-absent-text)]/15'
                }`}>
                  {store.isActive ? (
                    <svg className="w-5 h-5 text-[var(--status-completed-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-[var(--status-absent-text)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  )}
                </div>
                <div>
                  <p className={`text-sm font-semibold ${store.isActive ? 'text-[var(--status-completed-text)]' : 'text-[var(--status-absent-text)]'}`}>
                    {store.name}
                  </p>
                  <p className={`text-xs mt-0.5 ${store.isActive ? 'text-[var(--status-completed-text)]' : 'text-[var(--status-absent-text)]'}`}>
                    {store.isActive ? '営業中' : '停止中'}
                  </p>
                </div>
              </div>
            </Card>

            {/* 基本情報 */}
            <Card variant="elevated" padding="none">
              <div className="px-6 py-4 border-b border-[var(--md-sys-color-outline-variant)]">
                <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">基本情報</h3>
              </div>
              <dl className="divide-y divide-[var(--md-sys-color-surface-container-high)]">
                {[
                  { label: '店舗名', value: store.name, mono: false },
                  { label: '店舗コード', value: store.code, mono: true },
                  { label: '都道府県', value: store.prefecture || '—', mono: false },
                  { label: '住所', value: store.address || '—', mono: false },
                  { label: '電話番号', value: store.phone || '—', mono: false },
                  { label: 'メール', value: store.email || '—', mono: false },
                  { label: '登録日', value: store.createdAt ? format(new Date(store.createdAt), 'yyyy年M月d日', { locale: ja }) : '—', mono: false },
                ].map(item => (
                  <div key={item.label} className="px-6 py-3.5 flex gap-4">
                    <dt className="w-32 text-sm text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">{item.label}</dt>
                    <dd className={`text-sm text-[var(--md-sys-color-on-surface)] ${item.mono ? 'font-mono' : ''}`}>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>

            {/* 統計 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <SummaryCard
                label="担当顧客数"
                value={store._count?.customers ?? 0}
                unit="名"
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                  </svg>
                }
              />
              <SummaryCard
                label="総訪問スケジュール数"
                value={store._count?.visitSchedules ?? 0}
                unit="件"
                icon={
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                }
              />
            </div>
          </div>
        ) : (
          <Card variant="outlined" padding="none">
            <EmptyState title="店舗情報を取得できませんでした" />
          </Card>
        )}
      </div>
    </>
  )
}
