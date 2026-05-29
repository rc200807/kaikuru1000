'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'

type Store = { id: string; name: string; code: string }
type Category = { id: string; name: string }
type VisitSchedule = {
  id: string
  visitDate: string
  store: Store
  user: { id: string; name: string } | null
}
type PurchaseItem = {
  id: string
  itemName: string
  category: string
  categoryId: string | null
  imageUrls: string
  quantity: number
  purchasePrice: number
  janCode: string | null
  rakutenData: string | null
  aiResearch: string | null
  aiResearchedAt: string | null
  createdAt: string
  visitSchedule: VisitSchedule
  purchaseCategory: Category | null
}

type ListResponse = { items: PurchaseItem[]; total: number; page: number; limit: number }

type AiResearchResult = {
  productDetail?: string
  estimatedCondition?: string
  // AI(Gemini)は相場を文字列で返す（例: "¥10,000〜¥20,000"）。platforms もカンマ区切りの文字列。
  maxPrice?: string | number
  minPrice?: string | number
  platforms?: string | { name?: string; price?: number; note?: string }[] | string[]
  supplement?: string
}

// 値が表示に値するか（空・不明・-を除外）
function meaningful(v: unknown): v is string {
  if (typeof v !== 'string') return false
  const s = v.trim()
  return s !== '' && s !== '不明' && s !== '-' && s !== '－'
}

function parseUrls(json: string): string[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((x: any) => typeof x === 'string') : []
  } catch {
    return []
  }
}

function parseAi(json: string | null): AiResearchResult | null {
  if (!json) return null
  try {
    const v = JSON.parse(json)
    return v && typeof v === 'object' ? v : null
  } catch {
    return null
  }
}

function fmtYen(n: number | undefined | null): string {
  if (n === undefined || n === null || isNaN(Number(n))) return '-'
  return `¥${Number(n).toLocaleString('ja-JP')}`
}

export default function AdminPurchaseItemsPage() {
  const { status } = useSession()
  const router = useRouter()

  const [items, setItems] = useState<PurchaseItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const [stores, setStores] = useState<Store[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  const [storeId, setStoreId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [aiOnly, setAiOnly] = useState(false)
  const [q, setQ] = useState('')

  const [selectedId, setSelectedId] = useState<string | null>(null)

  const LIMIT = 60

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    Promise.all([
      fetch('/api/stores').then(r => r.ok ? r.json() : []),
      fetch('/api/admin/purchase-categories').then(r => r.ok ? r.json() : []),
    ]).then(([storesData, catsData]) => {
      const sList = Array.isArray(storesData) ? storesData : (storesData?.stores ?? [])
      setStores(sList.map((s: any) => ({ id: s.id, name: s.name, code: s.code })))
      setCategories(Array.isArray(catsData) ? catsData : [])
    }).catch(() => {})
  }, [status])

  const queryString = useMemo(() => {
    const p = new URLSearchParams()
    if (storeId) p.set('storeId', storeId)
    if (categoryId) p.set('categoryId', categoryId)
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (aiOnly) p.set('aiOnly', 'true')
    if (q.trim()) p.set('q', q.trim())
    p.set('limit', String(LIMIT))
    return p
  }, [storeId, categoryId, from, to, aiOnly, q])

  useEffect(() => {
    if (status !== 'authenticated') return
    setLoading(true)
    const p = new URLSearchParams(queryString)
    p.set('page', '1')
    fetch(`/api/admin/purchase-items?${p.toString()}`)
      .then(r => r.ok ? r.json() : { items: [], total: 0 })
      .then((d: ListResponse) => {
        setItems(d.items || [])
        setTotal(d.total || 0)
        setPage(1)
        setHasMore((d.total || 0) > (d.items?.length || 0))
      })
      .finally(() => setLoading(false))
  }, [status, queryString])

  function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    const nextPage = page + 1
    const p = new URLSearchParams(queryString)
    p.set('page', String(nextPage))
    fetch(`/api/admin/purchase-items?${p.toString()}`)
      .then(r => r.ok ? r.json() : { items: [] })
      .then((d: ListResponse) => {
        setItems(prev => [...prev, ...(d.items || [])])
        setPage(nextPage)
        setHasMore((prev => {
          const loadedNow = items.length + (d.items?.length || 0)
          return loadedNow < (d.total ?? total)
        })(0))
      })
      .finally(() => setLoadingMore(false))
  }

  const selected = useMemo(() => items.find(i => i.id === selectedId) ?? null, [items, selectedId])

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 56px)', color: 'var(--md-sys-color-on-surface)' }}>
      {/* ヘッダー */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--md-sys-color-outline-variant)' }}>
        <h1 style={{ margin: '0 0 2px', fontSize: 20, fontWeight: 700 }}>買取品目</h1>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
          全店舗の訪問時に登録された買取品目（{items.length}件 表示 / 全{total}件）
        </p>
      </div>

      {/* フィルタ */}
      <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--md-sys-color-outline-variant)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8, alignItems: 'end' }}>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 2 }}>キーワード</label>
          <input
            type="text" value={q} onChange={e => setQ(e.target.value)}
            placeholder="品名・JANで検索"
            style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 2 }}>店舗</label>
          <select
            value={storeId} onChange={e => setStoreId(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
          >
            <option value="">すべての店舗</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 2 }}>カテゴリ</label>
          <select
            value={categoryId} onChange={e => setCategoryId(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
          >
            <option value="">すべて</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 2 }}>訪問日（開始）</label>
          <input
            type="date" value={from} onChange={e => setFrom(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 2 }}>訪問日（終了）</label>
          <input
            type="date" value={to} onChange={e => setTo(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container-highest)', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: '100%' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={aiOnly} onChange={e => setAiOnly(e.target.checked)} />
            AI査定済みのみ
          </label>
          {(storeId || categoryId || from || to || aiOnly || q) && (
            <button
              type="button"
              onClick={() => { setStoreId(''); setCategoryId(''); setFrom(''); setTo(''); setAiOnly(false); setQ('') }}
              style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              クリア
            </button>
          )}
        </div>
      </div>

      {/* タイルグリッド */}
      <div style={{ padding: 20, flex: 1 }}>
        {items.length === 0 ? (
          <p style={{ textAlign: 'center', padding: 60, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>該当する買取品目がありません</p>
        ) : (
          <>
            <div style={{ borderRadius: 12, border: '1px solid var(--md-sys-color-outline-variant)', overflow: 'hidden', background: 'var(--md-sys-color-surface-container)' }}>
              {/* ヘッダー行（デスクトップのみ） */}
              <div
                className="purchase-items-header"
                style={{
                  display: 'grid',
                  gridTemplateColumns: '64px 1.6fr 1fr 0.6fr 0.9fr 1.3fr 1fr',
                  gap: 12,
                  padding: '10px 14px',
                  fontSize: 11,
                  color: 'var(--md-sys-color-on-surface-variant)',
                  borderBottom: '1px solid var(--md-sys-color-outline-variant)',
                  background: 'var(--md-sys-color-surface-container-high)',
                }}
              >
                <span>画像</span>
                <span>品名</span>
                <span>カテゴリ</span>
                <span style={{ textAlign: 'right' }}>数量</span>
                <span style={{ textAlign: 'right' }}>買取金額</span>
                <span>店舗</span>
                <span>訪問日</span>
              </div>
              {items.map((item, i) => {
                const images = parseUrls(item.imageUrls)
                const hasAi = !!item.aiResearchedAt
                return (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className="purchase-items-row"
                    style={{
                      textAlign: 'left',
                      padding: '10px 14px',
                      border: 'none',
                      borderTop: i === 0 ? 'none' : '1px solid var(--md-sys-color-outline-variant)',
                      background: 'transparent',
                      color: 'var(--md-sys-color-on-surface)',
                      cursor: 'pointer',
                      width: '100%',
                      display: 'grid',
                      gridTemplateColumns: '64px 1.6fr 1fr 0.6fr 0.9fr 1.3fr 1fr',
                      gap: 12,
                      alignItems: 'center',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--md-sys-color-surface-container-high)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    {/* 画像 */}
                    <div style={{ position: 'relative', width: 64, height: 64, borderRadius: 8, overflow: 'hidden', background: 'var(--md-sys-color-surface-container-high)', flexShrink: 0 }}>
                      {images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={images[0]} alt={item.itemName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--md-sys-color-on-surface-variant)', fontSize: 10 }}>—</div>
                      )}
                      {images.length > 1 && (
                        <span style={{ position: 'absolute', bottom: 2, right: 2, fontSize: 9, padding: '1px 5px', borderRadius: 999, background: 'rgba(0,0,0,0.6)', color: 'white', lineHeight: 1.3 }}>
                          {images.length}
                        </span>
                      )}
                    </div>
                    {/* 品名 */}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.itemName}</span>
                        {hasAi && (
                          <span style={{ flexShrink: 0, fontSize: 9, padding: '1px 6px', borderRadius: 999, background: 'rgba(96,165,250,0.2)', color: '#60a5fa', fontWeight: 600 }}>
                            AI
                          </span>
                        )}
                      </div>
                      {item.janCode && (
                        <div style={{ fontSize: 10, color: 'var(--md-sys-color-on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          JAN: {item.janCode}
                        </div>
                      )}
                    </div>
                    {/* カテゴリ */}
                    <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.purchaseCategory?.name || item.category || '-'}
                    </div>
                    {/* 数量 */}
                    <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', textAlign: 'right' }}>
                      ×{item.quantity}
                    </div>
                    {/* 買取金額 */}
                    <div style={{ fontSize: 13, fontWeight: 700, textAlign: 'right' }}>
                      {fmtYen(item.purchasePrice)}
                    </div>
                    {/* 店舗 */}
                    <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.visitSchedule.store.name}
                      {item.visitSchedule.user?.name ? (
                        <span style={{ opacity: 0.7 }}> ・ {item.visitSchedule.user.name}</span>
                      ) : null}
                    </div>
                    {/* 訪問日 */}
                    <div style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>
                      {new Date(item.visitSchedule.visitDate).toLocaleDateString('ja-JP')}
                    </div>
                  </button>
                )
              })}
            </div>

            {hasMore && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
                <button
                  onClick={loadMore} disabled={loadingMore}
                  style={{ padding: '8px 20px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13, fontWeight: 600, cursor: loadingMore ? 'wait' : 'pointer' }}
                >
                  {loadingMore ? '読み込み中...' : `もっと読み込む（${items.length} / ${total}件）`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* 詳細パネル（オーバーレイ） */}
      {selected && (
        <DetailDrawer item={selected} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}

function DetailDrawer({ item, onClose }: { item: PurchaseItem; onClose: () => void }) {
  const images = parseUrls(item.imageUrls)
  const ai = parseAi(item.aiResearch)
  const rakuten = (() => {
    if (!item.rakutenData) return null
    try { return JSON.parse(item.rakutenData) } catch { return null }
  })()

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(620px, 100%)', height: '100%', overflowY: 'auto', background: 'var(--md-sys-color-surface)', color: 'var(--md-sys-color-on-surface)', padding: 20, boxSizing: 'border-box' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 18, fontWeight: 700 }}>{item.itemName}</h2>
            <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>
              {item.visitSchedule.store.name} ・ {new Date(item.visitSchedule.visitDate).toLocaleString('ja-JP', { dateStyle: 'medium' })}
              {item.visitSchedule.user?.name ? ` ・ ${item.visitSchedule.user.name} 様` : ''}
            </div>
          </div>
          <button onClick={onClose} aria-label="閉じる" style={{ border: 'none', background: 'transparent', color: 'var(--md-sys-color-on-surface)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>×</button>
        </div>

        {/* 画像 */}
        {images.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {images.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                <img src={url} alt={`${item.itemName} ${i + 1}`} style={{ maxWidth: 180, maxHeight: 180, borderRadius: 8, objectFit: 'cover', display: 'block', border: '1px solid var(--md-sys-color-outline-variant)' }} />
              </a>
            ))}
          </div>
        )}

        {/* 基本情報 */}
        <Section title="基本情報">
          <Row label="カテゴリ" value={item.purchaseCategory?.name || item.category || '-'} />
          <Row label="数量" value={`${item.quantity}`} />
          <Row label="買取金額" value={fmtYen(item.purchasePrice)} />
          {item.janCode && <Row label="JANコード" value={item.janCode} />}
          <Row label="登録日時" value={new Date(item.createdAt).toLocaleString('ja-JP')} />
        </Section>

        {/* AI査定 */}
        {ai ? (
          <Section title={`AI査定（${item.aiResearchedAt ? new Date(item.aiResearchedAt).toLocaleString('ja-JP') : ''}）`}>
            {ai.productDetail && <Row label="商品詳細" value={ai.productDetail} multiline />}
            {ai.estimatedCondition && <Row label="コンディション" value={ai.estimatedCondition} />}
            {meaningful(ai.maxPrice) && <Row label="推定相場（美品〜良品）" value={ai.maxPrice as string} />}
            {meaningful(ai.minPrice) && <Row label="推定相場（難あり）" value={ai.minPrice as string} />}
            {/* platforms は文字列（カンマ区切り）。旧データの配列形式にも対応 */}
            {meaningful(ai.platforms) && <Row label="取引プラットフォーム" value={ai.platforms as string} multiline />}
            {Array.isArray(ai.platforms) && ai.platforms.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4 }}>プラットフォーム別</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
                  {(ai.platforms as any[]).map((p, i) => {
                    if (typeof p === 'string') return <li key={i}>{p}</li>
                    return (
                      <li key={i}>
                        {p.name ?? '-'}
                        {p.price !== undefined ? ` ：${fmtYen(p.price)}` : ''}
                        {p.note ? `（${p.note}）` : ''}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            {ai.supplement && <Row label="補足" value={ai.supplement} multiline />}
          </Section>
        ) : (
          <Section title="AI査定">
            <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>未実施</p>
          </Section>
        )}

        {/* 楽天検索結果 */}
        {rakuten && (
          <Section title="楽天検索データ">
            <pre style={{ fontSize: 11, lineHeight: 1.5, background: 'var(--md-sys-color-surface-container)', padding: 10, borderRadius: 8, overflow: 'auto', maxHeight: 240 }}>
              {JSON.stringify(rakuten, null, 2)}
            </pre>
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: 'var(--md-sys-color-on-surface-variant)' }}>{title}</h3>
      <div style={{ background: 'var(--md-sys-color-surface-container)', borderRadius: 10, padding: 12 }}>
        {children}
      </div>
    </section>
  )
}

function Row({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--md-sys-color-outline-variant)', alignItems: multiline ? 'flex-start' : 'baseline' }}>
      <div style={{ flex: '0 0 100px', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>{label}</div>
      <div style={{ flex: 1, whiteSpace: multiline ? 'pre-wrap' : 'normal', lineHeight: 1.6 }}>{value}</div>
    </div>
  )
}
