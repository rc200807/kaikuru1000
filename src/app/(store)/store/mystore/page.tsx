'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

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
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FFFBFE]">
        <div className="w-10 h-10 border-4 border-blue-800 border-t-transparent rounded-full animate-spin"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FFFBFE]">
      <header className="bg-blue-800 text-white sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <Link href="/store/profile" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            {(session?.user as any)?.avatar ? (
              <img src={(session?.user as any)?.avatar} className="w-9 h-9 rounded-full object-cover border-2 border-blue-600" alt="" />
            ) : (
              <div className="w-9 h-9 rounded-full bg-blue-600 border-2 border-blue-500 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-semibold">{(session?.user as any)?.name?.[0] ?? '?'}</span>
              </div>
            )}
            <div>
              <p className="text-blue-300 text-xs font-medium tracking-widest uppercase">買いクル 店舗ポータル</p>
              <h1 className="text-base font-semibold mt-0.5">{(session?.user as any)?.name}</h1>
            </div>
          </Link>
          <nav className="flex items-center gap-6">
            <Link href="/store/customers" className="text-sm text-blue-200 hover:text-white transition-colors">
              担当顧客
            </Link>
            <Link href="/store/schedule" className="text-sm text-blue-200 hover:text-white transition-colors">
              訪問スケジュール
            </Link>
            <Link href="/store/members" className="text-sm text-blue-200 hover:text-white transition-colors">
              メンバー
            </Link>
            <Link href="/store/mystore" className="text-sm font-medium text-white border-b border-white pb-0.5">
              店舗情報
            </Link>
            <button
              onClick={() => signOut({ callbackUrl: '/' })}
              className="text-sm text-blue-300 hover:text-white transition-colors ml-2"
            >
              ログアウト
            </button>
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">店舗情報</h2>

        {store ? (
          <div className="space-y-6">
            {/* ステータスバナー */}
            <div className={`rounded-2xl px-5 py-4 flex items-center gap-3 ${store.isActive ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${store.isActive ? 'bg-green-100' : 'bg-red-100'}`}>
                {store.isActive ? (
                  <svg className="w-5 h-5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                  </svg>
                )}
              </div>
              <div>
                <p className={`text-sm font-semibold ${store.isActive ? 'text-green-800' : 'text-red-800'}`}>{store.name}</p>
                <p className={`text-xs mt-0.5 ${store.isActive ? 'text-green-600' : 'text-red-600'}`}>
                  {store.isActive ? '営業中' : '停止中'}
                </p>
              </div>
            </div>

            {/* 基本情報 */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-700">基本情報</h3>
              </div>
              <dl className="divide-y divide-gray-50">
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
                    <dt className="w-32 text-sm text-gray-400 flex-shrink-0">{item.label}</dt>
                    <dd className={`text-sm text-gray-900 ${item.mono ? 'font-mono' : ''}`}>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* 統計 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
                <p className="text-4xl font-bold text-blue-800">{store._count?.customers ?? 0}</p>
                <p className="text-sm text-gray-500 mt-1">担当顧客数</p>
              </div>
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
                <p className="text-4xl font-bold text-blue-800">{store._count?.visitSchedules ?? 0}</p>
                <p className="text-sm text-gray-500 mt-1">総訪問スケジュール数</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-12 text-center text-sm text-gray-400 border border-gray-100">
            店舗情報を取得できませんでした
          </div>
        )}
      </div>
    </div>
  )
}
