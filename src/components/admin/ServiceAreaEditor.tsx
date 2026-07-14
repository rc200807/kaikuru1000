'use client'

import { useEffect, useMemo, useState } from 'react'
import { PREFECTURES } from '@/lib/prefectures'

type ServiceArea = { prefecture: string; cities: string[] }

function parse(json: string): ServiceArea[] {
  try {
    const a = JSON.parse(json || '[]')
    if (!Array.isArray(a)) return []
    return a
      .filter((x) => x && typeof x.prefecture === 'string' && Array.isArray(x.cities))
      .map((x) => ({ prefecture: x.prefecture, cities: x.cities.filter((c: unknown) => typeof c === 'string') }))
  } catch {
    return []
  }
}

/**
 * 店舗の対応エリア編集: 都道府県を選ぶと市区町村を取得し、複数選択して登録する。
 * value は JSON 文字列 [{prefecture, cities:[]}]。変更のたび onChange に JSON 文字列を返す。
 */
export default function ServiceAreaEditor({ value, onChange, focusPrefecture }: { value: string; onChange: (json: string) => void; focusPrefecture?: string }) {
  const areas = useMemo(() => parse(value), [value])
  const [selectedPref, setSelectedPref] = useState(focusPrefecture || '')

  // 店舗住所から都道府県が判明したら、その都道府県を自動で開く
  useEffect(() => {
    if (focusPrefecture) setSelectedPref((prev) => (prev ? prev : focusPrefecture))
  }, [focusPrefecture])
  const [cityOptions, setCityOptions] = useState<{ city: string; city_kana: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    if (!selectedPref) { setCityOptions([]); return }
    let cancelled = false
    setLoading(true)
    setFilter('')
    fetch(`/api/geo/cities?prefecture=${encodeURIComponent(selectedPref)}`)
      .then((r) => (r.ok ? r.json() : { cities: [] }))
      .then((data) => { if (!cancelled) setCityOptions(data.cities ?? []) })
      .catch(() => { if (!cancelled) setCityOptions([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [selectedPref])

  const commit = (next: ServiceArea[]) => {
    // 空の都道府県は除去
    const cleaned = next.filter((a) => a.cities.length > 0)
    onChange(JSON.stringify(cleaned))
  }

  const citiesOf = (pref: string) => areas.find((a) => a.prefecture === pref)?.cities ?? []

  const toggleCity = (pref: string, city: string) => {
    const existing = areas.find((a) => a.prefecture === pref)
    let next: ServiceArea[]
    if (!existing) {
      next = [...areas, { prefecture: pref, cities: [city] }]
    } else {
      const has = existing.cities.includes(city)
      const cities = has ? existing.cities.filter((c) => c !== city) : [...existing.cities, city]
      next = areas.map((a) => (a.prefecture === pref ? { ...a, cities } : a))
    }
    commit(next)
  }

  const addAll = (pref: string) => {
    const all = cityOptions.map((c) => c.city)
    const existing = areas.find((a) => a.prefecture === pref)
    const merged = Array.from(new Set([...(existing?.cities ?? []), ...all]))
    commit(existing ? areas.map((a) => (a.prefecture === pref ? { ...a, cities: merged } : a)) : [...areas, { prefecture: pref, cities: merged }])
  }

  const clearPref = (pref: string) => commit(areas.filter((a) => a.prefecture !== pref))

  const selectedCities = citiesOf(selectedPref)
  const filteredOptions = filter
    ? cityOptions.filter((c) => c.city.includes(filter) || c.city_kana.includes(filter))
    : cityOptions

  const chip = 'inline-flex items-center'

  return (
    <div style={{ background: 'var(--md-sys-color-surface-container-highest)', borderRadius: 10, padding: 14 }}>
      {/* 登録済みエリア */}
      {areas.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {areas.map((a) => (
            <div key={a.prefecture} style={{ background: 'var(--md-sys-color-surface-container)', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--md-sys-color-on-surface)' }}>{a.prefecture}（{a.cities.length}）</span>
                <button type="button" onClick={() => clearPref(a.prefecture)} style={{ fontSize: 11, color: '#f87171', cursor: 'pointer' }}>すべて削除</button>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {a.cities.map((c) => (
                  <span key={c} className={chip} style={{ gap: 4, padding: '2px 8px', borderRadius: 999, background: 'rgba(79,142,247,0.15)', color: '#4f8ef7', fontSize: 12 }}>
                    {c}
                    <button type="button" onClick={() => toggleCity(a.prefecture, c)} title="削除" style={{ cursor: 'pointer', color: '#4f8ef7', lineHeight: 1 }}>×</button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', margin: '0 0 12px' }}>対応エリアは未登録です。下から都道府県を選び、市区町村を追加してください。</p>
      )}

      {/* 追加UI */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select
          value={selectedPref}
          onChange={(e) => setSelectedPref(e.target.value)}
          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
        >
          <option value="">都道府県を選択…</option>
          {PREFECTURES.map((p) => (
            <option key={p} value={p}>{p}{citiesOf(p).length > 0 ? `（${citiesOf(p).length}）` : ''}</option>
          ))}
        </select>
        {selectedPref && cityOptions.length > 0 && (
          <>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="市区町村で絞り込み"
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container)', color: 'var(--md-sys-color-on-surface)', fontSize: 13, flex: 1, minWidth: 160 }}
            />
            <button type="button" onClick={() => addAll(selectedPref)} style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', background: 'transparent', color: 'var(--md-sys-color-on-surface)', cursor: 'pointer' }}>全選択</button>
          </>
        )}
      </div>

      {/* 市区町村チェックリスト */}
      {selectedPref && (
        <div style={{ marginTop: 10 }}>
          {loading ? (
            <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>市区町村を読み込み中…</p>
          ) : cityOptions.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>市区町村が取得できませんでした。</p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                gap: 4,
                maxHeight: 260,
                overflowY: 'auto',
                padding: 4,
                border: '1px solid var(--md-sys-color-outline-variant)',
                borderRadius: 8,
              }}
            >
              {filteredOptions.map((c) => {
                const checked = selectedCities.includes(c.city)
                return (
                  <label key={c.city} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5, color: 'var(--md-sys-color-on-surface)', background: checked ? 'rgba(79,142,247,0.12)' : 'transparent' }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleCity(selectedPref, c.city)} />
                    {c.city}
                  </label>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
