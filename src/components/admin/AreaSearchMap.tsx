'use client'

import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// エリア検索用の地図（OpenStreetMap + Leaflet・APIキー不要）。
// 入力住所に印を打ち、近隣店舗をランク色のマーカーで表示する。

export type MapStore = {
  id: string
  name: string
  lat: number | null
  lng: number | null
  color: string
  matchReason: string
  distanceKm: number | null
  rank: number
}

export default function AreaSearchMap({
  center,
  stores,
  selectedId,
  onSelect,
}: {
  center: { lat: number; lng: number } | null
  stores: MapStore[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const layerRef = useRef<L.LayerGroup | null>(null)
  const markersRef = useRef<Map<string, L.Marker>>(new Map())

  // 地図の初期化（1回）
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return
    const map = L.map(containerRef.current, { center: [35.681236, 139.767125], zoom: 11, scrollWheelZoom: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map)
    layerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    // 初期表示時のサイズ確定
    setTimeout(() => map.invalidateSize(), 100)
    return () => { map.remove(); mapRef.current = null }
  }, [])

  // マーカーの再構築（center / stores 変化時）
  useEffect(() => {
    const map = mapRef.current
    const layer = layerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    markersRef.current.clear()
    const bounds: [number, number][] = []

    // 入力住所マーカー（赤いピン）
    if (center) {
      const targetIcon = L.divIcon({
        className: '',
        html: '<div style="width:20px;height:20px;border-radius:50% 50% 50% 0;background:#dc2626;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 20],
      })
      L.marker([center.lat, center.lng], { icon: targetIcon, zIndexOffset: 1000 })
        .bindPopup('<b>入力住所</b>')
        .addTo(layer)
      bounds.push([center.lat, center.lng])
    }

    // 店舗マーカー（ランク色の円）
    for (const s of stores) {
      if (s.lat == null || s.lng == null) continue
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:22px;height:22px;border-radius:50%;background:${s.color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">${s.rank}</div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      })
      const marker = L.marker([s.lat, s.lng], { icon })
        .bindPopup(`<b>${escapeHtml(s.name)}</b><br>${escapeHtml(s.matchReason)}${s.distanceKm != null ? `<br>約 ${s.distanceKm} km` : ''}`)
        .on('click', () => onSelect(s.id))
        .addTo(layer)
      markersRef.current.set(s.id, marker)
      bounds.push([s.lat, s.lng])
    }

    if (bounds.length === 1) {
      map.setView(bounds[0], 14)
    } else if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
    }
    setTimeout(() => map.invalidateSize(), 50)
  }, [center, stores, onSelect])

  // 選択中の店舗にフォーカス
  useEffect(() => {
    const map = mapRef.current
    if (!map || !selectedId) return
    const marker = markersRef.current.get(selectedId)
    if (marker) {
      map.panTo(marker.getLatLng())
      marker.openPopup()
    }
  }, [selectedId])

  return <div ref={containerRef} className="w-full h-full min-h-[300px] rounded-xl overflow-hidden" style={{ background: '#e5e7eb' }} />
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c))
}
