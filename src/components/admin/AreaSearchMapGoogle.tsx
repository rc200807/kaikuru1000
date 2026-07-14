'use client'

import { useCallback, useEffect, useRef } from 'react'
import type { MapStore } from './AreaSearchMap'

// Google Maps 版のエリア検索マップ。
// NEXT_PUBLIC_GOOGLE_MAPS_API_KEY が設定されている場合に使用（未設定時はOSM版にフォールバック）。
// npm 依存は追加せず、Maps JavaScript API をスクリプト注入で読み込む。

declare global {
  interface Window {
    google?: any
    __gmapsLoading?: Promise<void>
  }
}

function loadGoogleMaps(key: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject()
  if (window.google?.maps) return Promise.resolve()
  if (window.__gmapsLoading) return window.__gmapsLoading
  window.__gmapsLoading = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&language=ja&region=JP`
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Google Maps の読み込みに失敗しました'))
    document.head.appendChild(s)
  })
  return window.__gmapsLoading
}

export default function AreaSearchMapGoogle({
  apiKey,
  center,
  stores,
  selectedId,
  onSelect,
}: {
  apiKey: string
  center: { lat: number; lng: number } | null
  stores: MapStore[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const infoRef = useRef<any>(null)
  const markersRef = useRef<Map<string, any>>(new Map())
  const readyRef = useRef(false)

  const renderMarkers = useCallback(() => {
    const g = window.google
    const map = mapRef.current
    if (!g || !map) return
    // 既存マーカー除去
    markersRef.current.forEach(m => m.setMap(null))
    markersRef.current.clear()
    const bounds = new g.maps.LatLngBounds()
    let count = 0

    if (center) {
      new g.maps.Marker({
        position: center, map, title: '入力住所', zIndex: 1000,
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#dc2626', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
      })
      bounds.extend(center); count++
    }
    for (const s of stores) {
      if (s.lat == null || s.lng == null) continue
      const pos = { lat: s.lat, lng: s.lng }
      const marker = new g.maps.Marker({
        position: pos, map, title: s.name,
        label: { text: String(s.rank), color: '#fff', fontSize: '11px', fontWeight: '700' },
        icon: { path: g.maps.SymbolPath.CIRCLE, scale: 11, fillColor: s.color, fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
      })
      marker.addListener('click', () => {
        onSelect(s.id)
        infoRef.current?.setContent(`<b>${escapeHtml(s.name)}</b><br>${escapeHtml(s.matchReason)}${s.distanceKm != null ? `<br>約 ${s.distanceKm} km` : ''}`)
        infoRef.current?.open(map, marker)
      })
      markersRef.current.set(s.id, marker)
      bounds.extend(pos); count++
    }
    if (count === 1) { map.setCenter(bounds.getCenter()); map.setZoom(14) }
    else if (count > 1) map.fitBounds(bounds, 40)
  }, [center, stores, onSelect])

  // 初期化 + 読み込み
  useEffect(() => {
    let cancelled = false
    loadGoogleMaps(apiKey).then(() => {
      if (cancelled || !containerRef.current) return
      const g = window.google
      if (!mapRef.current) {
        mapRef.current = new g.maps.Map(containerRef.current, {
          center: { lat: 35.681236, lng: 139.767125 }, zoom: 11,
          mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        })
        infoRef.current = new g.maps.InfoWindow()
      }
      readyRef.current = true
      renderMarkers()
    }).catch(() => {})
    return () => { cancelled = true }
  }, [apiKey, renderMarkers])

  // center/stores 変化でマーカー再描画
  useEffect(() => { if (readyRef.current) renderMarkers() }, [renderMarkers])

  // 選択店舗にフォーカス
  useEffect(() => {
    const map = mapRef.current
    const marker = selectedId ? markersRef.current.get(selectedId) : null
    if (map && marker) {
      map.panTo(marker.getPosition())
      infoRef.current?.setContent(marker.getTitle() || '')
      infoRef.current?.open(map, marker)
    }
  }, [selectedId])

  return <div ref={containerRef} className="w-full h-full min-h-[300px] rounded-xl overflow-hidden" style={{ background: '#e5e7eb' }} />
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
}
