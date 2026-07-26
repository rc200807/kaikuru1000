'use client'

// 空き家管理記録の追加フォーム（店舗/管理ポータル共用・モバイルファースト）。
// 管理項目マスタを縦積みし、項目ごとに写真＋メモを入力して一括保存する。
// GPSは任意（拒否・失敗でも保存はブロックしない）。
import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import Button from '@/components/Button'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'
import { AKIYA_ITEM_PHOTO_LIMIT } from '@/lib/akiya-items'
import { convertToJpegIfNeeded } from '@/lib/image-utils'

type ManagementItem = { id: string; name: string; sortOrder: number; isActive: boolean }

type PhotoEntry = {
  key: string
  status: 'uploading' | 'done' | 'error'
  url: string | null       // done のときのみ
  previewUrl: string       // ローカルプレビュー（objectURL）
  file: File | null        // 再試行用（done後は破棄）
}

type ItemDraft = {
  note: string
  photos: PhotoEntry[]
}

type GpsState =
  | { status: 'loading' }
  | { status: 'ok'; lat: number; lng: number; accuracy: number | null }
  | { status: 'error' }

// <input type="datetime-local"> 用の現在時刻（ローカル）
function nowLocalInput() {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

let photoKeySeq = 0

export default function AkiyaRecordForm({
  caseId,
  backHref,
}: {
  caseId: string
  backHref: string
}) {
  const router = useRouter()
  const [items, setItems] = useState<ManagementItem[]>([])
  const [drafts, setDrafts] = useState<Record<string, ItemDraft>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [performedAt, setPerformedAt] = useState(nowLocalInput())
  const [gps, setGps] = useState<GpsState>({ status: 'loading' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const savedRef = useRef(false)

  // 管理項目マスタの取得
  useEffect(() => {
    let cancelled = false
    fetch('/api/akiya-management-items?activeOnly=1')
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then((data: ManagementItem[]) => {
        if (cancelled) return
        const sorted = [...(Array.isArray(data) ? data : [])].sort((a, b) => a.sortOrder - b.sortOrder)
        setItems(sorted)
        setDrafts(Object.fromEntries(sorted.map(i => [i.id, { note: '', photos: [] }])))
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) { setLoadError('管理項目の取得に失敗しました'); setLoading(false) }
      })
    return () => { cancelled = true }
  }, [])

  // GPS取得（マウント時に一度。拒否・失敗しても保存は可能）
  const requestGps = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGps({ status: 'error' })
      return
    }
    setGps({ status: 'loading' })
    navigator.geolocation.getCurrentPosition(
      pos => setGps({
        status: 'ok',
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? null,
      }),
      () => setGps({ status: 'error' }),
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }, [])

  useEffect(() => { requestGps() }, [requestGps])

  function updateDraft(itemId: string, updater: (prev: ItemDraft) => ItemDraft) {
    setDrafts(prev => ({ ...prev, [itemId]: updater(prev[itemId] ?? { note: '', photos: [] }) }))
  }

  // 1枚アップロード（HEIC変換 → /api/akiya-records/images）
  async function uploadOne(itemId: string, key: string, file: File) {
    try {
      const converted = await convertToJpegIfNeeded(file)
      const fd = new FormData()
      fd.append('file', converted)
      const res = await fetch('/api/akiya-records/images', { method: 'POST', body: fd })
      if (!res.ok) throw new Error()
      const data = await res.json()
      if (!data?.url) throw new Error()
      updateDraft(itemId, d => ({
        ...d,
        photos: d.photos.map(p => p.key === key ? { ...p, status: 'done', url: data.url, file: null } : p),
      }))
    } catch {
      updateDraft(itemId, d => ({
        ...d,
        photos: d.photos.map(p => p.key === key ? { ...p, status: 'error' } : p),
      }))
    }
  }

  async function handleAddPhotos(itemId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    const current = drafts[itemId]?.photos.length ?? 0
    const room = AKIYA_ITEM_PHOTO_LIMIT - current
    if (room <= 0) {
      setMsg({ type: 'error', text: `写真は1項目あたり${AKIYA_ITEM_PHOTO_LIMIT}枚までです` })
      return
    }
    const accepted = files.slice(0, room)
    if (accepted.length < files.length) {
      setMsg({ type: 'error', text: `写真は1項目あたり${AKIYA_ITEM_PHOTO_LIMIT}枚までです（超過分は追加されませんでした）` })
    }
    const entries: PhotoEntry[] = accepted.map(file => ({
      key: `p${++photoKeySeq}`,
      status: 'uploading',
      url: null,
      previewUrl: URL.createObjectURL(file),
      file,
    }))
    updateDraft(itemId, d => ({ ...d, photos: [...d.photos, ...entries] }))
    // 逐次アップロード（多重POSTでのサーバ負荷・順序乱れを避ける）
    for (const entry of entries) {
      await uploadOne(itemId, entry.key, entry.file!)
    }
  }

  function retryPhoto(itemId: string, key: string) {
    const entry = drafts[itemId]?.photos.find(p => p.key === key)
    if (!entry?.file) return
    updateDraft(itemId, d => ({
      ...d,
      photos: d.photos.map(p => p.key === key ? { ...p, status: 'uploading' } : p),
    }))
    uploadOne(itemId, key, entry.file)
  }

  function removePhoto(itemId: string, key: string) {
    updateDraft(itemId, d => {
      const target = d.photos.find(p => p.key === key)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return { ...d, photos: d.photos.filter(p => p.key !== key) }
    })
  }

  const uploadingCount = Object.values(drafts).reduce(
    (n, d) => n + d.photos.filter(p => p.status === 'uploading').length, 0)
  const errorCount = Object.values(drafts).reduce(
    (n, d) => n + d.photos.filter(p => p.status === 'error').length, 0)

  async function handleSave() {
    if (saving || savedRef.current) return
    if (!performedAt) { setMsg({ type: 'error', text: '管理実行日時を入力してください' }); return }
    if (uploadingCount > 0) { setMsg({ type: 'error', text: '写真のアップロード完了をお待ちください' }); return }
    if (errorCount > 0 && !confirm('アップロードに失敗した写真があります。失敗した写真を除いて保存しますか？')) return

    setSaving(true)
    setMsg(null)
    try {
      const body = {
        performedAt: new Date(performedAt).toISOString(),
        gpsLat: gps.status === 'ok' ? gps.lat : null,
        gpsLng: gps.status === 'ok' ? gps.lng : null,
        gpsAccuracy: gps.status === 'ok' ? gps.accuracy : null,
        items: items.map(item => {
          const d = drafts[item.id] ?? { note: '', photos: [] }
          return {
            itemMasterId: item.id,
            note: d.note.trim(),
            photoUrls: d.photos.filter(p => p.status === 'done' && p.url).map(p => p.url!) ,
          }
        }),
      }
      const res = await fetch(`/api/akiya-cases/${caseId}/records`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || '記録の保存に失敗しました')
      }
      savedRef.current = true
      router.push(backHref)
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : '記録の保存に失敗しました' })
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner size="lg" fullPage label="読み込み中..." />

  const gpsChip = (() => {
    if (gps.status === 'loading') {
      return { label: '位置情報: 取得中…', cls: 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]' }
    }
    if (gps.status === 'ok') {
      return { label: `位置情報: 取得済み${gps.accuracy != null ? `（精度${Math.round(gps.accuracy)}m）` : ''}`, cls: 'bg-[rgba(34,197,94,0.15)] text-[#16a34a]' }
    }
    return { label: '位置情報: 取得できませんでした', cls: 'bg-[rgba(251,191,36,0.15)] text-[#b45309]' }
  })()

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-background)] pb-28">
      <AppBar
        title="管理記録を追加"
        subtitle="空き家管理"
        actions={<Link href={backHref}><Button variant="text" size="sm">← 戻る</Button></Link>}
      />

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {msg && <MessageBanner severity={msg.type}>{msg.text}</MessageBanner>}
        {loadError && <MessageBanner severity="error">{loadError}</MessageBanner>}

        {/* 実行日時・GPS */}
        <Card variant="outlined" padding="md">
          <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-3">実施情報</h2>
          <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">管理実行日時</label>
          <input
            type="datetime-local"
            value={performedAt}
            onChange={e => setPerformedAt(e.target.value)}
            className="w-full sm:w-64 h-12 px-3.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)]"
          />
          <div className="flex items-center gap-2 flex-wrap mt-3">
            <span className={`text-xs font-medium px-3 py-1.5 rounded-full ${gpsChip.cls}`}>
              {gpsChip.label}
            </span>
            {gps.status !== 'loading' && (
              <button
                type="button"
                onClick={requestGps}
                className="text-xs text-[var(--portal-primary,#374151)] hover:underline"
              >
                再取得
              </button>
            )}
          </div>
          {gps.status === 'error' && (
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1.5">
              位置情報が取得できなくても記録は保存できます
            </p>
          )}
        </Card>

        {/* 管理項目（マスタの並び順で縦積み） */}
        {items.length === 0 ? (
          <Card variant="outlined" padding="md">
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">管理項目がありません</p>
          </Card>
        ) : items.map((item, idx) => {
          const d = drafts[item.id] ?? { note: '', photos: [] }
          const filled = d.note.trim().length > 0 || d.photos.length > 0
          return (
            <Card key={item.id} variant="outlined" padding="md">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                  <span className="inline-flex items-center justify-center w-5 h-5 mr-2 rounded-full bg-[var(--md-sys-color-surface-container-high)] text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)] align-middle">
                    {idx + 1}
                  </span>
                  {item.name}
                </h3>
                {filled && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[rgba(34,197,94,0.15)] text-[#16a34a] shrink-0">入力済み</span>
                )}
              </div>

              {/* 写真 */}
              <div className="flex flex-wrap gap-2 mb-3">
                {d.photos.map(p => (
                  <div key={p.key} className="relative w-20 h-20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.previewUrl}
                      alt=""
                      className={`w-20 h-20 object-cover rounded-lg border border-[var(--md-sys-color-outline-variant)] ${p.status !== 'done' ? 'opacity-50' : ''}`}
                    />
                    {p.status === 'uploading' && (
                      <span className="absolute inset-0 flex items-center justify-center">
                        <svg className="animate-spin h-5 w-5 text-[var(--portal-primary,#374151)]" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      </span>
                    )}
                    {p.status === 'error' && (
                      <button
                        type="button"
                        onClick={() => retryPhoto(item.id, p.key)}
                        className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 rounded-lg bg-black/50 text-white text-[10px] font-semibold"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                        再試行
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(item.id, p.key)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#dc2626] text-white flex items-center justify-center shadow"
                      aria-label="写真を削除"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3 h-3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                {d.photos.length < AKIYA_ITEM_PHOTO_LIMIT && (
                  <label className="w-20 h-20 rounded-lg border border-dashed border-[var(--md-sys-color-outline)] flex flex-col items-center justify-center gap-1 text-[var(--md-sys-color-on-surface-variant)] cursor-pointer hover:bg-[var(--md-sys-color-surface-container)] transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
                    </svg>
                    <span className="text-[10px] font-medium">写真追加</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                      multiple
                      className="hidden"
                      onChange={e => handleAddPhotos(item.id, e)}
                    />
                  </label>
                )}
              </div>
              <p className="text-[10px] text-[var(--md-sys-color-on-surface-faint,var(--md-sys-color-on-surface-variant))] mb-2">
                {d.photos.length} / {AKIYA_ITEM_PHOTO_LIMIT}枚
              </p>

              {/* メモ */}
              <textarea
                value={d.note}
                onChange={e => updateDraft(item.id, prev => ({ ...prev, note: e.target.value }))}
                rows={2}
                placeholder="状況メモ（任意）"
                className="w-full px-3.5 py-2.5 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] resize-y"
              />
            </Card>
          )
        })}
      </div>

      {/* 保存バー（画面下固定・モバイルの親指圏）。店舗ポータルのモバイルはBottomNavの上に重ねる */}
      <div className={`fixed ${backHref.startsWith('/store') ? 'bottom-16 md:bottom-0' : 'bottom-0'} left-0 right-0 z-30 bg-[var(--md-sys-color-surface)] shadow-[inset_0_1px_0_0_rgba(0,0,0,0.08)] safe-area-bottom`}>
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0 text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
            {uploadingCount > 0
              ? `写真をアップロード中…（残り${uploadingCount}枚）`
              : errorCount > 0
                ? `アップロード失敗が${errorCount}枚あります`
                : '全項目をまとめて保存します'}
          </div>
          <Button
            onClick={handleSave}
            loading={saving}
            disabled={saving || uploadingCount > 0 || items.length === 0}
          >
            {saving ? '保存中...' : '記録を保存'}
          </Button>
        </div>
      </div>
    </div>
  )
}
