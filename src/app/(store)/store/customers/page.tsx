'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Modal from '@/components/Modal'
import TextField from '@/components/TextField'
import TimeSelect from '@/components/TimeSelect'
import { useBusinessHours } from '@/hooks/useBusinessHours'
import SearchFilterBar from '@/components/SearchFilterBar'
import DataTable from '@/components/DataTable'
import type { Column } from '@/components/DataTable'
import LoadingSpinner from '@/components/LoadingSpinner'
import MessageBanner from '@/components/MessageBanner'

type Customer = {
  id: string
  name: string
  furigana: string
  email: string
  phone: string
  address: string
  customerType: string
  createdAt?: string | null
  lastVisitDate?: string | null
  nextVisit?: { visitDate: string; startTime?: string | null } | null
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  if (isNaN(dt.getTime())) return '—'
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`
}

export default function StoreCustomersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const bizHours = useBusinessHours()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [search, setSearch] = useState('')

  // ページネーション
  const [customersPage, setCustomersPage] = useState(1)
  const [customersHasMore, setCustomersHasMore] = useState(false)
  const [customersTotal, setCustomersTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const CUSTOMERS_LIMIT = 50

  // 新規顧客追加（顧客作成 → 案件作成 → 訪問予定追加 の一連ウィザード）
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1) // 1:顧客 2:案件 3:予定 4:完了
  const [addCustomerForm, setAddCustomerForm] = useState({ name: '', furigana: '', email: '', phone: '', postalCode: '', address: '', leadSource: '' })
  const [createdCustomer, setCreatedCustomer] = useState<{ id: string; name: string } | null>(null)
  const [dealForm, setDealForm] = useState({ detail: '' })
  const [createdDealId, setCreatedDealId] = useState<string | null>(null)
  const [scheduleForm, setScheduleForm] = useState({ visitDate: '', startTime: '', endTime: '', note: '' })
  const [addCustomerSubmitting, setAddCustomerSubmitting] = useState(false)
  const [addCustomerMsg, setAddCustomerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [zipLooking, setZipLooking] = useState(false)

  // 郵便番号(7桁)から住所を自動入力
  async function lookupPostal(zip: string) {
    const digits = zip.replace(/[-ー\s]/g, '')
    if (digits.length !== 7) return
    setZipLooking(true)
    try {
      const res = await fetch(`/api/postal-lookup?zipcode=${digits}`)
      const data = await res.json()
      if (res.ok && data.address) {
        setAddCustomerForm(f => ({ ...f, address: data.address }))
      } else {
        setAddCustomerMsg({ type: 'error', text: '該当する住所が見つかりませんでした' })
      }
    } catch {
      setAddCustomerMsg({ type: 'error', text: '住所の検索に失敗しました' })
    }
    setZipLooking(false)
  }

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  // 検索語が変わるたびに、全担当顧客を対象にサーバー側で検索して取得（デバウンス）
  useEffect(() => {
    if (status !== 'authenticated') return
    const storeId = (session!.user as any).id
    const q = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''
    const handle = setTimeout(() => {
      setSearching(true)
      fetch(`/api/stores/${storeId}/customers?page=1&limit=${CUSTOMERS_LIMIT}${q}`)
        .then(r => r.json())
        .then(data => {
          const list = data?.customers ?? (Array.isArray(data) ? data : [])
          setCustomers(list)
          setCustomersTotal(data?.total ?? list.length)
          setCustomersPage(1)
          setCustomersHasMore((data?.total ?? list.length) > CUSTOMERS_LIMIT)
        })
        .catch(() => { /* ignore */ })
        .finally(() => { setLoading(false); setSearching(false) })
    }, search.trim() ? 300 : 0)
    return () => clearTimeout(handle)
  }, [status, session, search])

  async function loadMoreCustomers() {
    setLoadingMore(true)
    const storeId = (session?.user as any).id
    const nextPage = customersPage + 1
    const q = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''
    try {
      const res = await fetch(`/api/stores/${storeId}/customers?page=${nextPage}&limit=${CUSTOMERS_LIMIT}${q}`)
      const data = await res.json()
      const list = data?.customers ?? (Array.isArray(data) ? data : [])
      setCustomers(prev => [...prev, ...list])
      setCustomersPage(nextPage)
      setCustomersHasMore(nextPage * CUSTOMERS_LIMIT < (data?.total ?? 0))
    } catch { /* ignore */ }
    setLoadingMore(false)
  }

  async function refreshCustomers() {
    const storeId = (session?.user as any).id
    const q = search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''
    const listRes = await fetch(`/api/stores/${storeId}/customers?page=1&limit=${CUSTOMERS_LIMIT}${q}`)
    const listData = await listRes.json()
    const list = listData?.customers ?? (Array.isArray(listData) ? listData : [])
    setCustomers(list)
    setCustomersTotal(listData?.total ?? list.length)
    setCustomersPage(1)
    setCustomersHasMore((listData?.total ?? list.length) > CUSTOMERS_LIMIT)
  }

  function openAddWizard() {
    setShowAddCustomer(true)
    setWizardStep(1)
    setAddCustomerMsg(null)
    setAddCustomerForm({ name: '', furigana: '', email: '', phone: '', postalCode: '', address: '', leadSource: '' })
    setCreatedCustomer(null)
    setDealForm({ detail: '' })
    setCreatedDealId(null)
    setScheduleForm({ visitDate: '', startTime: '', endTime: '', note: '' })
  }

  // ステップ1: 顧客作成 → 案件作成へ
  async function handleCreateCustomer(e: React.FormEvent) {
    e.preventDefault()
    setAddCustomerSubmitting(true)
    setAddCustomerMsg(null)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: addCustomerForm.name,
          furigana: addCustomerForm.furigana,
          email: addCustomerForm.email,
          phone: addCustomerForm.phone,
          address: addCustomerForm.address,
          leadSource: addCustomerForm.leadSource || undefined,
          // パスワードはAPIで自動生成
          customerType: 'regular',
          skipLicenseKey: true,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        setAddCustomerMsg({ type: 'error', text: data.error ?? '顧客の作成に失敗しました' })
        setAddCustomerSubmitting(false)
        return
      }
      const created = await res.json()
      setCreatedCustomer({ id: created.id, name: created.name ?? addCustomerForm.name })
      await refreshCustomers() // 一覧に即時反映
      setWizardStep(2)
    } catch {
      setAddCustomerMsg({ type: 'error', text: '顧客の作成に失敗しました' })
    }
    setAddCustomerSubmitting(false)
  }

  // ステップ2: 案件作成 → 訪問予定へ（スキップ可）
  async function handleCreateDeal() {
    if (!createdCustomer) return
    setAddCustomerSubmitting(true)
    setAddCustomerMsg(null)
    try {
      const storeId = (session?.user as any).id
      const res = await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: createdCustomer.id, storeId, detail: dealForm.detail }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setAddCustomerMsg({ type: 'error', text: data.error ?? '案件の作成に失敗しました' })
        setAddCustomerSubmitting(false)
        return
      }
      const created = await res.json()
      setCreatedDealId(created.id ?? null)
      setWizardStep(3)
    } catch {
      setAddCustomerMsg({ type: 'error', text: '案件の作成に失敗しました' })
    }
    setAddCustomerSubmitting(false)
  }

  // ステップ3: 訪問予定追加 → 完了（スキップ可）
  async function handleCreateSchedule() {
    if (!createdCustomer || !scheduleForm.visitDate) return
    setAddCustomerSubmitting(true)
    setAddCustomerMsg(null)
    try {
      const storeId = (session?.user as any).id
      const res = await fetch('/api/visit-schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: createdCustomer.id,
          storeId,
          dealId: createdDealId || undefined,
          visitDate: scheduleForm.visitDate,
          startTime: scheduleForm.startTime || undefined,
          endTime: scheduleForm.endTime || undefined,
          note: scheduleForm.note || undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setAddCustomerMsg({ type: 'error', text: data.error ?? '訪問予定の作成に失敗しました' })
        setAddCustomerSubmitting(false)
        return
      }
      await refreshCustomers() // 次回訪問予定列を更新
      setWizardStep(4)
    } catch {
      setAddCustomerMsg({ type: 'error', text: '訪問予定の作成に失敗しました' })
    }
    setAddCustomerSubmitting(false)
  }

  // 案件/予定をスキップして完了画面へ（予定スキップ時は一覧を最新化）
  async function skipToDone() {
    await refreshCustomers()
    setWizardStep(4)
  }

  // 検索はサーバー側（全担当顧客対象）で実施済みのため、ここでは絞り込まない
  const filtered = customers

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  }

  const customerColumns: Column<Customer>[] = [
    {
      key: 'name',
      header: '氏名',
      render: (c) => (
        <div>
          <div className="font-medium text-[var(--md-sys-color-on-surface)]">{c.name}</div>
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{c.furigana}</div>
        </div>
      ),
      sortable: true,
      sortValue: (c) => c.furigana,
    },
    {
      key: 'contact',
      header: '連絡先',
      hideOnMobile: true,
      render: (c) => (
        <div>
          <div className="text-[var(--md-sys-color-on-surface)]">{c.phone}</div>
          <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{c.email}</div>
        </div>
      ),
    },
    {
      key: 'address',
      header: '住所',
      hideOnMobile: true,
      render: (c) => (
        <div className="text-[var(--md-sys-color-on-surface-variant)] max-w-48 truncate">{c.address}</div>
      ),
    },
    {
      key: 'customerType',
      header: 'タイプ',
      hideOnMobile: true,
      render: (c) => {
        const typeMap: Record<string, { label: string; cls: string }> = {
          delivery: { label: '宅配型', cls: 'bg-blue-100 text-blue-700' },
          regular:  { label: '通常買取', cls: 'bg-purple-100 text-purple-700' },
          visit:    { label: '訪問型', cls: 'bg-green-100 text-green-700' },
        }
        const t = typeMap[c.customerType] ?? typeMap.visit
        return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${t.cls}`}>{t.label}</span>
      },
    },
    {
      key: 'createdAt',
      header: '登録日',
      hideOnMobile: true,
      render: (c) => <span className="text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">{fmtDate(c.createdAt)}</span>,
      sortable: true,
      sortValue: (c) => c.createdAt ?? '',
    },
    {
      key: 'lastVisit',
      header: '最終訪問日',
      hideOnMobile: true,
      render: (c) => <span className="text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">{fmtDate(c.lastVisitDate)}</span>,
      sortable: true,
      sortValue: (c) => c.lastVisitDate ?? '',
    },
    {
      key: 'nextVisit',
      header: '次回訪問予定',
      hideOnMobile: true,
      render: (c) => (
        <span className="text-[var(--md-sys-color-on-surface)] whitespace-nowrap">
          {c.nextVisit
            ? `${fmtDate(c.nextVisit.visitDate)}${c.nextVisit.startTime ? ` ${c.nextVisit.startTime}` : ''}`
            : '—'}
        </span>
      ),
      sortable: true,
      sortValue: (c) => c.nextVisit?.visitDate ?? '',
    },
  ]

  return (
    <>
      <AppBar
        title="担当顧客"
        subtitle={search.trim() ? `${customersTotal}名 該当` : `${customersTotal}名`}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex-1">
            <SearchFilterBar
              filters={[
                { key: 'search', label: '検索', type: 'text', placeholder: '氏名・メール・電話で検索...' },
              ]}
              values={{ search }}
              onChange={(_, v) => setSearch(v)}
              onClear={() => setSearch('')}
            />
            {search.trim() && (
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1.5 px-1">
                {searching ? '全顧客から検索中...' : `「${search.trim()}」に該当: ${customersTotal}名`}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outlined"
              onClick={() => router.push('/store/customers/import')}
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                CSVインポート
              </span>
            </Button>
            <Button
              variant="filled"
              onClick={openAddWizard}
            >
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                </svg>
                新規顧客追加
              </span>
            </Button>
          </div>
        </div>

        <Card variant="outlined" padding="none">
          <DataTable
            columns={customerColumns}
            data={filtered}
            rowKey={(c) => c.id}
            onRowClick={(c) => router.push(`/store/customers/${c.id}`)}
            emptyTitle={search.trim() ? '検索結果がありません' : '担当顧客がいません'}
          />
        </Card>

        {customersHasMore && (
          <div className="flex justify-center mt-6">
            <Button
              variant="tonal"
              onClick={loadMoreCustomers}
              loading={loadingMore}
              disabled={loadingMore}
            >
              {loadingMore ? '読み込み中...' : `もっと読み込む（${customers.length} / ${customersTotal}名）`}
            </Button>
          </div>
        )}
      </div>

      {/* 新規顧客追加ウィザード（顧客 → 案件 → 訪問予定） */}
      <Modal
        open={showAddCustomer}
        onClose={() => setShowAddCustomer(false)}
        title={
          wizardStep === 1 ? '新規顧客追加'
          : wizardStep === 2 ? '案件を作成（任意）'
          : wizardStep === 3 ? '訪問予定を追加（任意）'
          : '登録完了'
        }
        disableBackdropClose
      >
        {/* ステッパー */}
        {wizardStep < 4 && (
          <div className="flex items-center justify-center gap-2 mb-4 text-xs">
            {([['1', '顧客'], ['2', '案件'], ['3', '予定']] as const).map(([n, label], i) => {
              const stepNo = i + 1
              const activeOrDone = wizardStep >= stepNo
              return (
                <div key={n} className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold ${activeOrDone ? 'bg-[var(--portal-primary)] text-white' : 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]'}`}>{n}</span>
                  <span className={activeOrDone ? 'text-[var(--md-sys-color-on-surface)] font-medium' : 'text-[var(--md-sys-color-on-surface-variant)]'}>{label}</span>
                  {i < 2 && <span className="w-5 h-px bg-[var(--md-sys-color-outline-variant)]" />}
                </div>
              )
            })}
          </div>
        )}

        {addCustomerMsg && (
          <div className="mb-4">
            <MessageBanner severity={addCustomerMsg.type} dismissible onDismiss={() => setAddCustomerMsg(null)}>
              {addCustomerMsg.text}
            </MessageBanner>
          </div>
        )}

        {/* ステップ1: 顧客情報 */}
        {wizardStep === 1 && (
          <form onSubmit={handleCreateCustomer} className="space-y-4" autoComplete="off">
            <input type="text" name="prevent-autofill" autoComplete="off" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
            <input type="password" name="prevent-autofill-pw" autoComplete="new-password" style={{ display: 'none' }} aria-hidden="true" tabIndex={-1} />
            <TextField label="氏名" value={addCustomerForm.name} onChange={v => setAddCustomerForm(f => ({ ...f, name: v }))} required placeholder="山田 太郎" autoComplete="off" name="kk-cust-name" />
            <TextField label="ふりがな" value={addCustomerForm.furigana} onChange={v => setAddCustomerForm(f => ({ ...f, furigana: v }))} required placeholder="やまだ たろう" autoComplete="off" name="kk-cust-furigana" />
            <TextField label="メールアドレス（任意）" type="email" value={addCustomerForm.email} onChange={v => setAddCustomerForm(f => ({ ...f, email: v }))} placeholder="taro@example.com" autoComplete="off" name="kk-cust-email" />
            <TextField label="電話番号（任意）" type="tel" value={addCustomerForm.phone} onChange={v => setAddCustomerForm(f => ({ ...f, phone: v }))} placeholder="090-1234-5678" autoComplete="off" name="kk-cust-phone" />
            <div>
              <TextField
                label="郵便番号（任意）"
                type="text"
                value={addCustomerForm.postalCode}
                onChange={v => {
                  setAddCustomerForm(f => ({ ...f, postalCode: v }))
                  if (v.replace(/[-ー\s]/g, '').length === 7) lookupPostal(v)
                }}
                placeholder="1234567"
                autoComplete="off"
                name="kk-cust-zip"
              />
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
                {zipLooking ? '住所を検索中...' : '7桁を入力すると住所が自動入力されます'}
              </p>
            </div>
            <TextField label="住所（任意）" value={addCustomerForm.address} onChange={v => setAddCustomerForm(f => ({ ...f, address: v }))} placeholder="東京都渋谷区..." autoComplete="off" name="kk-cust-address" />
            <div>
              <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">流入経路（任意）</label>
              <select
                value={addCustomerForm.leadSource}
                onChange={e => setAddCustomerForm(f => ({ ...f, leadSource: e.target.value }))}
                className="w-full h-12 px-3 text-sm rounded border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40"
              >
                <option value="">未設定</option>
                <option value="電話">電話</option>
                <option value="LINE">LINE</option>
                <option value="紹介">紹介</option>
                <option value="Webフォーム">Webフォーム</option>
                <option value="おいくら">おいくら</option>
                <option value="その他">その他</option>
              </select>
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">※ お問い合わせフォーム経由のお客様は自動的に「Webフォーム」が設定されます。</p>
            </div>
            <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">
              ※ パスワードは自動生成されます。お客様には後でマイページからパスワード設定をご案内ください。
            </p>
            <div className="flex gap-3 pt-2">
              <Button type="submit" variant="filled" loading={addCustomerSubmitting} disabled={addCustomerSubmitting || !addCustomerForm.name || !addCustomerForm.furigana} fullWidth>
                {addCustomerSubmitting ? '登録中...' : '次へ（顧客を登録）'}
              </Button>
            </div>
          </form>
        )}

        {/* ステップ2: 案件作成 */}
        {wizardStep === 2 && (
          <div className="space-y-4">
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              <span className="font-medium text-[var(--md-sys-color-on-surface)]">{createdCustomer?.name} 様</span> を登録しました。続けて案件を作成できます（不要な場合はスキップ）。
            </p>
            <div>
              <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">案件内容（買取内容など）</label>
              <textarea
                value={dealForm.detail}
                onChange={(e) => setDealForm({ detail: e.target.value })}
                rows={4}
                placeholder="例: 古い切手コレクション、ブランドバッグ数点 など"
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="text" onClick={() => setWizardStep(3)} disabled={addCustomerSubmitting}>
                スキップ
              </Button>
              <Button variant="filled" onClick={handleCreateDeal} loading={addCustomerSubmitting} disabled={addCustomerSubmitting} fullWidth>
                案件を作成して次へ
              </Button>
            </div>
          </div>
        )}

        {/* ステップ3: 訪問予定追加 */}
        {wizardStep === 3 && (
          <div className="space-y-4">
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              {createdDealId ? '案件を作成しました。' : ''}訪問予定を追加できます（不要な場合はスキップ）。
            </p>
            <div>
              <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">訪問日 <span className="text-[var(--md-sys-color-error,#B3261E)]">*</span></label>
              <input
                type="date"
                value={scheduleForm.visitDate}
                onChange={(e) => setScheduleForm(f => ({ ...f, visitDate: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">開始時間（任意）</label>
                <TimeSelect value={scheduleForm.startTime} onChange={v => setScheduleForm(f => ({ ...f, startTime: v }))} rangeStart={bizHours?.start} rangeEnd={bizHours?.end} selectClassName="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40" />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">終了時間（任意）</label>
                <TimeSelect value={scheduleForm.endTime} onChange={v => setScheduleForm(f => ({ ...f, endTime: v }))} rangeStart={bizHours?.start} rangeEnd={bizHours?.end} selectClassName="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1 block">メモ（任意）</label>
              <textarea value={scheduleForm.note} onChange={(e) => setScheduleForm(f => ({ ...f, note: e.target.value }))} rows={2} placeholder="訪問に関するメモ" className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:ring-2 focus:ring-[var(--portal-primary)]/40" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="text" onClick={skipToDone} disabled={addCustomerSubmitting}>
                スキップして完了
              </Button>
              <Button variant="filled" onClick={handleCreateSchedule} loading={addCustomerSubmitting} disabled={addCustomerSubmitting || !scheduleForm.visitDate} fullWidth>
                訪問予定を登録して完了
              </Button>
            </div>
          </div>
        )}

        {/* ステップ4: 完了 */}
        {wizardStep === 4 && (
          <div className="space-y-5 text-center py-2">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <div>
              <p className="font-semibold text-[var(--md-sys-color-on-surface)]">{createdCustomer?.name} 様 を登録しました</p>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mt-1">
                {createdDealId ? '案件' : ''}{createdDealId ? '・' : ''}必要に応じて訪問予定も登録されました。
              </p>
            </div>
            <div className="flex gap-3 pt-1">
              <Button variant="tonal" onClick={() => setShowAddCustomer(false)} fullWidth>
                閉じる
              </Button>
              {createdCustomer && (
                <Button variant="filled" onClick={() => router.push(`/store/customers/${createdCustomer.id}`)} fullWidth>
                  顧客ページを開く
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
