'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import AppBar from '@/components/AppBar'
import LoadingSpinner from '@/components/LoadingSpinner'

const AreaSearchMap = dynamic(() => import('@/components/admin/AreaSearchMap'), { ssr: false })
const AreaSearchMapGoogle = dynamic(() => import('@/components/admin/AreaSearchMapGoogle'), { ssr: false })
// NEXT_PUBLIC_GOOGLE_MAPS_API_KEY があれば Google Maps、無ければ OpenStreetMap
const GOOGLE_MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

function scoreColor(score: number): string {
  if (score >= 20) return '#10b981'
  if (score >= 15) return '#14b8a6'
  if (score >= 10) return '#e8927c'
  if (score >= 5) return '#3b82f6'
  return '#f59e0b'
}

const PREFECTURES = [
  '北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県',
  '茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県',
  '新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県',
  '三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県',
  '鳥取県','島根県','岡山県','広島県','山口県',
  '徳島県','香川県','愛媛県','高知県',
  '福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県',
]

type CityData = { city: string; city_kana: string }

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
  distanceKm: number | null
  lat: number | null
  lng: number | null
}

type SearchResponse = {
  query: string
  center: { lat: number; lng: number } | null
  results: StoreResult[]
  totalStores: number
}

export default function AdminAreaSearchPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  // 検索モード: 'simple' = テキスト一行, 'detail' = 段階式
  const [searchMode, setSearchMode] = useState<'simple' | 'detail'>('simple')
  const [simpleAddress, setSimpleAddress] = useState('')

  // 住所入力（詳細モード）
  const [prefecture, setPrefecture] = useState('')
  const [cityInput, setCityInput] = useState('')
  const [detail, setDetail] = useState('')
  const [cities, setCities] = useState<CityData[]>([])
  const [loadingCities, setLoadingCities] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suggestRef = useRef<HTMLDivElement>(null)
  const cityInputRef = useRef<HTMLInputElement>(null)

  // 検索
  const [searching, setSearching] = useState(false)
  const [result, setResult] = useState<SearchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null)

  // 都道府県選択時に市区町村を取得
  const fetchCities = useCallback(async (pref: string) => {
    if (!pref) { setCities([]); return }
    setLoadingCities(true)
    try {
      const res = await fetch(`/api/geo/cities?prefecture=${encodeURIComponent(pref)}`)
      const data = await res.json()
      setCities(Array.isArray(data.cities) ? data.cities : [])
    } catch {
      setCities([])
    } finally {
      setLoadingCities(false)
    }
  }, [])

  // クリック外でサジェストを閉じる
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (suggestRef.current && !suggestRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  if (status === 'loading') return <LoadingSpinner size="lg" fullPage />
  if (status === 'unauthenticated') { router.push('/admin/login'); return null }

  const fullAddress = searchMode === 'simple'
    ? simpleAddress.trim()
    : `${prefecture}${cityInput}${detail}`.trim()

  function handlePrefChange(pref: string) {
    setPrefecture(pref)
    setCityInput('')
    setDetail('')
    setResult(null); setSelectedStoreId(null)
    fetchCities(pref)
  }

  // サジェストフィルタリング
  const filteredCities = cityInput
    ? cities.filter(c =>
        c.city.includes(cityInput) ||
        c.city_kana.includes(cityInput)
      )
    : cities

  function handleCitySelect(city: string) {
    setCityInput(city)
    setShowSuggestions(false)
    setTimeout(() => {
      const detailInput = document.getElementById('detail-input')
      detailInput?.focus()
    }, 50)
  }

  async function runSearch(addr: string) {
    if (!addr) return
    setSearching(true)
    setError(null)
    setResult(null); setSelectedStoreId(null)
    try {
      const res = await fetch(`/api/stores/search?address=${encodeURIComponent(addr)}&limit=5`)
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

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!fullAddress) return
    await runSearch(fullAddress)
  }

  async function handleQuickAddress(addr: string) {
    // テキスト検索モードに切り替えて即検索
    setSearchMode('simple')
    setSimpleAddress(addr)

    // 詳細モードの値も設定しておく
    const prefMatch = addr.match(/^(北海道|東京都|大阪府|京都府|.{2,3}県)/)
    if (prefMatch) {
      const pref = prefMatch[1]
      const rest = addr.slice(pref.length)
      setPrefecture(pref)
      setCityInput(rest)
      setDetail('')
      fetchCities(pref)
    }

    await runSearch(addr)
  }

  function getScoreBadge(score: number, reason: string) {
    if (score >= 20) return { color: 'from-emerald-500 to-green-500', text: reason, icon: '◎' }
    if (score >= 15) return { color: 'from-teal-500 to-emerald-500', text: reason, icon: '◎' }
    if (score >= 10) return { color: 'from-blue-500 to-cyan-500', text: reason, icon: '○' }
    if (score >= 5) return { color: 'from-sky-500 to-blue-400', text: reason, icon: '○' }
    return { color: 'from-amber-500 to-orange-500', text: reason, icon: '△' }
  }

  const inputCls = "h-10 px-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-lg text-[var(--md-sys-color-on-surface)] placeholder:text-[var(--md-sys-color-outline)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:ring-2 focus:ring-[var(--portal-primary,#374151)]/20 transition-all"

  const legend = [
    { color: 'from-emerald-500 to-green-500', icon: '◎', label: '同一区内・市区町村', desc: '入力住所と同じエリア' },
    { color: 'from-teal-500 to-emerald-500', icon: '◎', label: '同一市内・近隣', desc: '同じ市内や15km以内' },
    { color: 'from-blue-500 to-cyan-500', icon: '○', label: '同一都道府県', desc: '同じ都道府県内' },
    { color: 'from-sky-500 to-blue-400', icon: '○', label: '近隣エリア（県境）', desc: '隣接県で20km以内' },
    { color: 'from-amber-500 to-orange-500', icon: '△', label: '隣接都道府県', desc: '隣り合う都道府県' },
  ]

  // 地図に渡す店舗（検索結果があればそれを、無ければ空）
  const mapStores = (result?.results ?? []).map((s, i) => ({
    id: s.id, name: s.name, lat: s.lat, lng: s.lng,
    color: scoreColor(s.score), matchReason: s.matchReason, distanceKm: s.distanceKm, rank: i + 1,
  }))

  return (
    <div className="flex flex-col" style={{ height: 'calc(100dvh - 1rem)' }}>
      <AppBar title="エリア検索" subtitle="住所から近隣店舗を検索" />

      {/* 地図エリア（AppBar 下を全面占有） */}
      <div className="flex-1 relative min-h-0 bg-[#e5e7eb]">
        {/* ===== 背景の全画面地図（常時表示） ===== */}
        <div className="absolute inset-0">
          {GOOGLE_MAPS_KEY
            ? <AreaSearchMapGoogle apiKey={GOOGLE_MAPS_KEY} center={result?.center ?? null} stores={mapStores} selectedId={selectedStoreId} onSelect={setSelectedStoreId} />
            : <AreaSearchMap center={result?.center ?? null} stores={mapStores} selectedId={selectedStoreId} onSelect={setSelectedStoreId} />}
        </div>

        {/* ===== 左フローティングパネル（検索＋結果＋凡例） ===== */}
        <div className="absolute z-[500] top-3 left-3 right-3 sm:right-auto sm:w-[384px] flex flex-col rounded-2xl bg-[var(--md-sys-color-surface)] shadow-2xl ring-1 ring-black/10 max-h-[calc(100%-1.5rem)] sm:bottom-3 sm:max-h-none">
          {/* 検索ヘッダー（固定） */}
          <div className="flex-shrink-0 p-3 rounded-t-2xl">
            {/* モード切替 */}
            <div className="flex gap-1 mb-2.5 p-0.5 bg-[var(--md-sys-color-surface-container-high)] rounded-lg">
              <button
                type="button"
                onClick={() => setSearchMode('simple')}
                className={`flex-1 text-xs font-medium py-1.5 px-3 rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  searchMode === 'simple'
                    ? 'bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] shadow-sm'
                    : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                テキスト検索
              </button>
              <button
                type="button"
                onClick={() => setSearchMode('detail')}
                className={`flex-1 text-xs font-medium py-1.5 px-3 rounded-md transition-all flex items-center justify-center gap-1.5 ${
                  searchMode === 'detail'
                    ? 'bg-[var(--md-sys-color-surface)] text-[var(--md-sys-color-on-surface)] shadow-sm'
                    : 'text-[var(--md-sys-color-on-surface-variant)] hover:text-[var(--md-sys-color-on-surface)]'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                </svg>
                詳細入力
              </button>
            </div>

            <form onSubmit={handleSearch}>
              {/* ── テキスト検索モード ── */}
              {searchMode === 'simple' && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={simpleAddress}
                    onChange={e => setSimpleAddress(e.target.value)}
                    placeholder="住所を入力（例: 東京都渋谷区）"
                    className={`${inputCls} flex-1`}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearch(e as unknown as React.FormEvent) } }}
                  />
                  <button
                    type="submit"
                    disabled={searching || !simpleAddress.trim()}
                    aria-label="検索"
                    className="h-10 w-11 flex-shrink-0 grid place-items-center bg-[var(--portal-primary,#374151)] text-[var(--portal-primary-container,#fff)] rounded-lg hover:opacity-90 disabled:opacity-40 transition-all"
                  >
                    {searching ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    )}
                  </button>
                </div>
              )}

              {/* ── 詳細入力モード ── */}
              {searchMode === 'detail' && (
                <div className="space-y-2">
                  {/* 都道府県 */}
                  <select
                    value={prefecture}
                    onChange={e => handlePrefChange(e.target.value)}
                    className={`${inputCls} w-full`}
                  >
                    <option value="">都道府県を選択</option>
                    {PREFECTURES.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>

                  {/* 市区町村（サジェスト付き） */}
                  <div className="relative" ref={suggestRef}>
                    <input
                      ref={cityInputRef}
                      type="text"
                      value={cityInput}
                      onChange={e => { setCityInput(e.target.value); setShowSuggestions(true) }}
                      onFocus={() => { if (cities.length > 0) setShowSuggestions(true) }}
                      placeholder={loadingCities ? '読み込み中...' : prefecture ? '市区町村を入力' : '先に都道府県を選択'}
                      disabled={!prefecture}
                      className={`${inputCls} w-full`}
                    />
                    {showSuggestions && filteredCities.length > 0 && (
                      <div className="absolute z-[600] top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline-variant)] rounded-xl shadow-lg">
                        {filteredCities.map(c => (
                          <button
                            key={c.city}
                            type="button"
                            onClick={() => handleCitySelect(c.city)}
                            className="w-full text-left px-3 py-2 text-sm text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors first:rounded-t-xl last:rounded-b-xl flex items-center justify-between"
                          >
                            <span>{c.city}</span>
                            {c.city_kana && (
                              <span className="text-[11px] text-[var(--md-sys-color-outline)] ml-2">{c.city_kana}</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {showSuggestions && cityInput && filteredCities.length === 0 && cities.length > 0 && (
                      <div className="absolute z-[600] top-full left-0 right-0 mt-1 bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline-variant)] rounded-xl shadow-lg px-3 py-2.5 text-xs text-[var(--md-sys-color-outline)]">
                        候補が見つかりません
                      </div>
                    )}
                  </div>

                  {/* 番地等（任意） */}
                  <input
                    id="detail-input"
                    type="text"
                    value={detail}
                    onChange={e => setDetail(e.target.value)}
                    placeholder="番地・建物名（任意）"
                    className={`${inputCls} w-full`}
                  />

                  {fullAddress && (
                    <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate">
                      <span className="font-medium text-[var(--md-sys-color-on-surface)]">検索住所:</span> {fullAddress}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={searching || !prefecture}
                    className="w-full h-10 flex items-center justify-center gap-2 bg-[var(--portal-primary,#374151)] text-[var(--portal-primary-container,#fff)] text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-40 transition-all"
                  >
                    {searching ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        検索中
                      </>
                    ) : '検索'}
                  </button>
                </div>
              )}
            </form>

            {/* クイック住所 */}
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {[
                '東京都渋谷区', '東京都新宿区', '大阪府大阪市北区',
                '愛知県名古屋市中区', '福岡県福岡市博多区', '北海道札幌市中央区',
              ].map(q => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { if (searchMode === 'simple') { setSimpleAddress(q) } else { handleQuickAddress(q) } }}
                  className="text-[11px] px-2.5 py-1 rounded-full border border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-high)] hover:text-[var(--md-sys-color-on-surface)] transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* 検索結果リスト（スクロール） */}
          <div className="flex-1 min-h-0 overflow-y-auto border-t border-[var(--md-sys-color-outline-variant)]">
            {error && (
              <div className="m-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 text-xs text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            {searching && (
              <div className="p-3 space-y-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-20 rounded-xl bg-[var(--md-sys-color-surface-container-high)] animate-pulse" />
                ))}
              </div>
            )}

            {!searching && result && (
              <>
                <div className="px-3 pt-3 pb-1.5 flex items-center justify-between sticky top-0 bg-[var(--md-sys-color-surface)] z-10">
                  <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">検索結果</h2>
                  <span className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
                    全 {result.totalStores} 店舗中 {result.results.length} 件
                  </span>
                </div>

                {result.results.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <svg className="w-10 h-10 mx-auto mb-2 text-[var(--md-sys-color-outline)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">近隣に該当する店舗がありません</p>
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">別の住所で試してみてください</p>
                  </div>
                ) : (
                  <div className="p-3 pt-2 space-y-2">
                    {result.results.map((store, idx) => {
                      const badge = getScoreBadge(store.score, store.matchReason)
                      const selected = selectedStoreId === store.id
                      return (
                        <button
                          key={store.id}
                          type="button"
                          onClick={() => setSelectedStoreId(store.id)}
                          className={`w-full text-left flex items-stretch rounded-xl border overflow-hidden transition-all bg-[var(--md-sys-color-surface-container)] ${
                            selected
                              ? 'border-[var(--portal-primary,#374151)] ring-2 ring-[var(--portal-primary,#374151)]/30'
                              : 'border-[var(--md-sys-color-outline-variant)] hover:border-[var(--portal-primary,#374151)]/50'
                          }`}
                        >
                          {/* 順位バー */}
                          <div className={`w-10 flex-shrink-0 bg-gradient-to-b ${badge.color} flex flex-col items-center justify-center text-white`}>
                            <span className="text-[10px] font-medium opacity-80">#{idx + 1}</span>
                            <span className="text-base font-bold leading-none">{badge.icon}</span>
                          </div>

                          {/* メイン情報 */}
                          <div className="flex-1 p-2.5 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] truncate">{store.name}</h3>
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]">
                                {store.code}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full text-white bg-gradient-to-r ${badge.color}`}>
                                {store.matchReason}
                              </span>
                              {store.distanceKm !== null && (
                                <span className="text-[10px] font-medium text-[var(--md-sys-color-on-surface-variant)]">約 {store.distanceKm} km</span>
                              )}
                            </div>
                            {store.address && (
                              <p className="mt-1.5 text-[11px] text-[var(--md-sys-color-on-surface-variant)] break-all line-clamp-2">{store.address}</p>
                            )}
                            {store.phone && (
                              <p className="mt-0.5 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">{store.phone}</p>
                            )}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </>
            )}

            {!searching && !result && !error && (
              <div className="px-5 py-10 text-center">
                <svg className="w-12 h-12 mx-auto mb-3 text-[var(--md-sys-color-outline)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-sm font-medium text-[var(--md-sys-color-on-surface-variant)]">住所を入力して近くの店舗を検索</p>
                <p className="text-xs text-[var(--md-sys-color-outline)] mt-1">都道府県・市区町村・隣接エリアで自動マッチング</p>
              </div>
            )}
          </div>

          {/* マッチ度の凡例（折りたたみ・フッター） */}
          <details className="flex-shrink-0 border-t border-[var(--md-sys-color-outline-variant)] rounded-b-2xl group">
            <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--md-sys-color-on-surface-variant)] flex items-center justify-between hover:text-[var(--md-sys-color-on-surface)]">
              <span>マッチ度の見方</span>
              <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </summary>
            <div className="px-3 pb-3 space-y-1.5">
              {legend.map(l => (
                <div key={l.label} className="flex items-center gap-2.5">
                  <div className={`w-7 h-7 rounded-md bg-gradient-to-br ${l.color} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>{l.icon}</div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)] leading-tight">{l.label}</p>
                    <p className="text-[10px] text-[var(--md-sys-color-on-surface-variant)] leading-tight">{l.desc}</p>
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-[var(--md-sys-color-outline)] pt-1">※ 同一ランク内では距離が近い店舗を優先表示</p>
            </div>
          </details>
        </div>
      </div>
    </div>
  )
}
