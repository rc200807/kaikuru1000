'use client'

// 空き家管理案件の新規作成（店舗ポータル）。
// 顧客は自店舗の担当顧客から検索して選択する。
import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import EmptyState from '@/components/EmptyState'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'
import { useStoreScope } from '@/components/store/StoreScopeContext'
import { AKIYA_PLAN_OPTIONS, AKIYA_PLAN_BADGE, type AkiyaPlan } from '@/lib/akiya-plans'
import { AKIYA_STATUS_OPTIONS, AKIYA_STATUS_BADGE, type AkiyaStatus } from '@/lib/akiya-status'

type Customer = {
  id: string
  name: string
  furigana: string | null
  phone: string | null
  address: string | null
}

export default function StoreAkiyaNewPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const scope = useStoreScope()
  const supportsAkikuru = scope.services.includes('akikuru')

  // 顧客検索・選択
  const [customerQuery, setCustomerQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<Customer[]>([])
  const [searchingCustomers, setSearchingCustomers] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  // フォーム
  const [propertyAddress, setPropertyAddress] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [plan, setPlan] = useState<AkiyaPlan>('standard')
  const [caseStatus, setCaseStatus] = useState<AkiyaStatus>('pre_contract')
  const [note, setNote] = useState('')
  const [nextVisitAt, setNextVisitAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (authStatus === 'unauthenticated') router.push('/store/login')
  }, [authStatus, router])

  // 顧客検索（自店舗担当顧客・デバウンス付き）
  useEffect(() => {
    if (authStatus !== 'authenticated') return
    const storeId = (session?.user as any)?.id
    if (!storeId) return
    let cancelled = false
    setSearchingCustomers(true)
    const timer = setTimeout(() => {
      const q = customerQuery.trim()
      fetch(`/api/stores/${storeId}/customers?limit=100${q ? `&search=${encodeURIComponent(q)}` : ''}`)
        .then(r => (r.ok ? r.json() : { customers: [] }))
        .then(data => {
          if (cancelled) return
          const list = (data?.customers ?? []) as any[]
          setCustomerResults(list.map(c => ({
            id: c.id, name: c.name, furigana: c.furigana ?? null,
            phone: c.phone ?? null, address: c.address ?? null,
          })))
        })
        .catch(() => {})
        .finally(() => { if (!cancelled) setSearchingCustomers(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [authStatus, session, customerQuery])

  async function handleSave() {
    if (saving) return
    if (!selectedCustomer) { setMsg({ type: 'error', text: '顧客を選択してください' }); return }
    if (!propertyAddress.trim()) { setMsg({ type: 'error', text: '物件住所を入力してください' }); return }
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch('/api/akiya-cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: selectedCustomer.id,
          propertyAddress: propertyAddress.trim(),
          startDate: startDate || '',
          endDate: endDate || '',
          plan,
          status: caseStatus,
          note: note.trim() || undefined,
          nextVisitAt: nextVisitAt || '',
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.error || '案件の作成に失敗しました')
      }
      const created = await res.json()
      router.push(`/store/akiya/${created.id}`)
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : '案件の作成に失敗しました' })
      setSaving(false)
    }
  }

  if (authStatus === 'loading' || scope.loading) {
    return <LoadingSpinner size="lg" fullPage />
  }

  if (!supportsAkikuru) {
    return (
      <div className="min-h-screen bg-[var(--md-sys-color-background)]">
        <AppBar title="空き家管理" actions={<Link href="/store/akiya"><Button variant="text" size="sm">← 戻る</Button></Link>} />
        <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-4">
          <EmptyState
            title="この店舗はアキクルに対応していません"
            description="空き家管理（アキクル）をご利用になるには、店舗の対応サービスにアキクルを追加する必要があります。本部までお問い合わせください。"
          />
        </div>
      </div>
    )
  }

  const chipClass = 'text-xs px-3 py-1.5 rounded-full border transition-all disabled:opacity-50'

  return (
    <div className="min-h-screen bg-[var(--md-sys-color-background)] pb-16">
      <AppBar
        title="新規空き家管理案件"
        subtitle="空き家管理"
        actions={<Link href="/store/akiya"><Button variant="text" size="sm">← 一覧</Button></Link>}
      />

      <div className="max-w-3xl mx-auto px-4 py-5 space-y-4">
        {msg && <MessageBanner severity={msg.type}>{msg.text}</MessageBanner>}

        {/* 顧客選択 */}
        <Card variant="outlined" padding="md">
          <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-3">
            顧客 <span className="text-[var(--md-sys-color-error,#B3261E)]">*</span>
          </h2>
          {selectedCustomer ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--store-primary)] bg-[var(--store-primary-container)] px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] truncate">
                  {selectedCustomer.name}
                  {selectedCustomer.furigana && <span className="ml-1.5 text-xs font-normal text-[var(--md-sys-color-on-surface-variant)]">（{selectedCustomer.furigana}）</span>}
                </p>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] truncate mt-0.5">
                  {[selectedCustomer.phone, selectedCustomer.address].filter(Boolean).join(' ・ ') || '連絡先未登録'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="text-xs text-[var(--store-primary)] hover:underline shrink-0"
              >
                変更
              </button>
            </div>
          ) : (
            <>
              <div className="relative mb-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor"
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--md-sys-color-on-surface-variant)] pointer-events-none"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
                </svg>
                <input
                  type="text"
                  value={customerQuery}
                  onChange={e => setCustomerQuery(e.target.value)}
                  placeholder="顧客名・ふりがな・電話番号で検索"
                  className="w-full pl-9 pr-3 py-2 rounded-full border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-highest)] text-[var(--md-sys-color-on-surface)] text-sm focus:outline-none focus:border-[var(--store-primary)]"
                />
              </div>
              <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] max-h-56 overflow-y-auto divide-y divide-[var(--md-sys-color-outline-variant)]">
                {searchingCustomers ? (
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] px-3.5 py-3">検索中...</p>
                ) : customerResults.length === 0 ? (
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] px-3.5 py-3">該当する顧客がいません</p>
                ) : customerResults.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setSelectedCustomer(c); setMsg(null) }}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-[var(--md-sys-color-surface-container)] transition-colors"
                  >
                    <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)] truncate">
                      {c.name}
                      {c.furigana && <span className="ml-1.5 text-xs font-normal text-[var(--md-sys-color-on-surface-variant)]">（{c.furigana}）</span>}
                    </p>
                    <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] truncate mt-0.5">
                      {[c.phone, c.address].filter(Boolean).join(' ・ ') || '連絡先未登録'}
                    </p>
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>

        {/* 物件情報 */}
        <Card variant="outlined" padding="md">
          <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] mb-3">物件情報</h2>
          <div className="space-y-4">
            <div>
              <TextField
                label="物件住所"
                value={propertyAddress}
                onChange={setPropertyAddress}
                placeholder="物件の所在地"
                required
              />
              <div className="flex justify-end mt-1.5">
                <button
                  type="button"
                  disabled={!selectedCustomer?.address}
                  onClick={() => selectedCustomer?.address && setPropertyAddress(selectedCustomer.address)}
                  className="text-xs text-[var(--store-primary)] hover:underline disabled:opacity-40 disabled:no-underline"
                >
                  顧客住所をコピー
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TextField label="利用開始日" type="date" value={startDate} onChange={setStartDate} />
              <TextField label="利用終了日" type="date" value={endDate} onChange={setEndDate} />
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">プラン</label>
              <div className="flex flex-wrap gap-1.5">
                {AKIYA_PLAN_OPTIONS.map(opt => {
                  const active = plan === opt.value
                  const b = AKIYA_PLAN_BADGE[opt.value]
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPlan(opt.value)}
                      className={chipClass}
                      style={active
                        ? { background: b.bg, color: b.fg, borderColor: b.fg }
                        : { background: 'transparent', color: 'var(--md-sys-color-on-surface-variant)', borderColor: 'var(--md-sys-color-outline-variant)' }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">ステータス</label>
              <div className="flex flex-wrap gap-1.5">
                {AKIYA_STATUS_OPTIONS.map(opt => {
                  const active = caseStatus === opt.value
                  const b = AKIYA_STATUS_BADGE[opt.value]
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setCaseStatus(opt.value)}
                      className={chipClass}
                      style={active
                        ? { background: b.bg, color: b.fg, borderColor: b.fg }
                        : { background: 'transparent', color: 'var(--md-sys-color-on-surface-variant)', borderColor: 'var(--md-sys-color-outline-variant)' }}
                    >
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <TextField
              label="物件メモ（任意）"
              value={note}
              onChange={setNote}
              rows={3}
              placeholder="鍵の保管場所、注意事項など"
            />
            <TextField label="次回訪問日（任意）" type="date" value={nextVisitAt} onChange={setNextVisitAt} className="sm:max-w-xs" />
          </div>
        </Card>

        <div className="flex justify-end gap-2">
          <Link href="/store/akiya"><Button variant="text">キャンセル</Button></Link>
          <Button onClick={handleSave} loading={saving} disabled={saving || !selectedCustomer || !propertyAddress.trim()}>
            {saving ? '作成中...' : '案件を作成'}
          </Button>
        </div>
      </div>
    </div>
  )
}
