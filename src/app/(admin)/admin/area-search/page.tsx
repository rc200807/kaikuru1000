'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import LoadingSpinner from '@/components/LoadingSpinner'

type StoreResult = {
  id: string
  name: string
  code: string
  prefecture: string | null
  address: string | null
  phone: string | null
  email: string | null
  score: number
  matchReason: string
}

type SearchResponse = {
  query: string
  results: StoreResult[]
  totalStores: number
}

export default function AdminAreaSearchPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [address, setAddress] = useState('')
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<SearchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (status === 'loading') return <LoadingSpinner size="lg" fullPage />
  if (status === 'unauthenticated') { router.push('/admin/login'); return null }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!address.trim()) return
    setSearching(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch(`/api/stores/search?address=${encodeURIComponent(address.trim())}&limit=5`)
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || '検索に失敗しました')
      } else {
        const data: SearchResponse = await res.json()
        setResult(data)
      }
    } catch {
      setError('検索中にエラーが発生しました')
    } finally {
      setSearching(false)
    }
  }

  function getScoreBadge(score: number, reason: string) {
    if (score >= 20) return { color: 'from-emerald-500 to-green-500', text: reason, icon: '◎' }
    if (score >= 10) return { color: 'from-blue-500 to-cyan-500', text: reason, icon: '○' }
    return { color: 'from-amber-500 to-orange-500', text: reason, icon: '△' }
  }

  return (
    <>
      <AppBar title="エリア検索" subtitle="住所から近隣店舗を検索" />

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* 検索フォーム */}
        <div className="bg-[var(--md-sys-color-surface-container)] rounded-2xl p-6 border border-[var(--md-sys-color-outline-variant)]">
          <form onSubmit={handleSearch} className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-2">
                住所を入力
              </label>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-3">
                都道府県から入力すると、より正確な結果が得られます
              </p>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="例: 東京都渋谷区渋谷1-1-1"
                  className="flex-1 h-12 px-4 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-xl text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:ring-2 focus:ring-[var(--portal-primary,#374151)]/20 transition-all"
                />
                <button
                  type="submit"
                  disabled={searching || !address.trim()}
                  className="h-12 px-6 bg-gradient-to-r from-[var(--portal-primary,#374151)] to-[var(--portal-primary,#374151)] text-white text-sm font-semibold rounded-xl hover:opacity-90 disabled:opacity-40 transition-all flex items-center gap-2 flex-shrink-0"
                >
                  {searching ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      検索中
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      検索
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* クイック住所ボタン */}
            <div className="flex flex-wrap gap-2">
              {[
                '東京都渋谷区',
                '東京都新宿区',
                '大阪府大阪市北区',
                '愛知県名古屋市中区',
                '福岡県福岡市博多区',
                '北海道札幌市中央区',
              ].map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { setAddress(q); }}
                  className="text-xs px-3 py-1.5 rounded-full border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--md-sys-color-on-surface)] transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </form>
        </div>

        {/* マッチ度の凡例 */}
        <div className="bg-[var(--md-sys-color-surface-container)] rounded-2xl p-5 border border-[var(--md-sys-color-outline-variant)]">
          <h3 className="text-xs font-bold text-[var(--md-sys-color-on-surface)] mb-3 uppercase tracking-wider">マッチ度の見方</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">◎</div>
              <div>
                <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">同一区内</p>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">入力住所と同じ市区町村にある店舗</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">○</div>
              <div>
                <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">同一都道府県</p>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">同じ都道府県内にある店舗</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">△</div>
              <div>
                <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">隣接都道府県</p>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">隣り合う都道府県にある店舗</p>
              </div>
            </div>
          </div>
        </div>

        {/* エラー */}
        {error && (
          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-4 text-sm text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* 検索結果 */}
        {result && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[var(--md-sys-color-on-surface)]">
                検索結果
              </h2>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                全 {result.totalStores} 店舗中 {result.results.length} 件マッチ
              </p>
            </div>

            {result.results.length === 0 ? (
              <div className="bg-[var(--md-sys-color-surface-container)] rounded-2xl p-8 text-center border border-[var(--md-sys-color-outline-variant)]">
                <svg className="w-12 h-12 mx-auto mb-3 text-[var(--md-sys-color-outline)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">近隣に該当する店舗がありません</p>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">別の住所で試してみてください</p>
              </div>
            ) : (
              <div className="space-y-3">
                {result.results.map((store, idx) => {
                  const badge = getScoreBadge(store.score, store.matchReason)
                  return (
                    <div
                      key={store.id}
                      className="bg-[var(--md-sys-color-surface-container)] rounded-2xl border border-[var(--md-sys-color-outline-variant)] overflow-hidden hover:border-[var(--portal-primary,#374151)]/50 transition-all"
                    >
                      <div className="flex items-stretch">
                        {/* 順位バー */}
                        <div className={`w-14 flex-shrink-0 bg-gradient-to-b ${badge.color} flex flex-col items-center justify-center text-white`}>
                          <span className="text-xs font-medium opacity-80">#{idx + 1}</span>
                          <span className="text-lg font-bold">{badge.icon}</span>
                        </div>

                        {/* メイン情報 */}
                        <div className="flex-1 p-4 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-base font-bold text-[var(--md-sys-color-on-surface)]">
                                  {store.name}
                                </h3>
                                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">
                                  {store.code}
                                </span>
                              </div>

                              {/* マッチ理由バッジ */}
                              <span className={`inline-block mt-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full text-white bg-gradient-to-r ${badge.color}`}>
                                {store.matchReason}
                              </span>
                            </div>
                          </div>

                          {/* 詳細情報 */}
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                            {store.address && (
                              <div className="flex items-start gap-1.5 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                <svg className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <span className="break-all">{store.address}</span>
                              </div>
                            )}
                            {store.phone && (
                              <div className="flex items-center gap-1.5 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                                <span>{store.phone}</span>
                              </div>
                            )}
                            {store.email && (
                              <div className="flex items-center gap-1.5 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                <span>{store.email}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* 初期状態のイラスト */}
        {!result && !error && !searching && (
          <div className="text-center py-12">
            <svg className="w-20 h-20 mx-auto mb-4 text-[var(--md-sys-color-outline)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <p className="text-sm font-medium text-[var(--md-sys-color-on-surface-variant)]">
              住所を入力して近くの店舗を検索
            </p>
            <p className="text-xs text-[var(--md-sys-color-outline)] mt-1">
              都道府県・市区町村・隣接エリアで自動マッチングします
            </p>
          </div>
        )}
      </div>
    </>
  )
}
