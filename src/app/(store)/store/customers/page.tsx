'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import AppBar from '@/components/AppBar'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Modal from '@/components/Modal'
import TextField from '@/components/TextField'
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
}

export default function StoreCustomersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // ページネーション
  const [customersPage, setCustomersPage] = useState(1)
  const [customersHasMore, setCustomersHasMore] = useState(false)
  const [customersTotal, setCustomersTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const CUSTOMERS_LIMIT = 50

  // 新規顧客追加
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [addCustomerForm, setAddCustomerForm] = useState({ name: '', furigana: '', email: '', phone: '', address: '', password: '' })
  const [addCustomerSubmitting, setAddCustomerSubmitting] = useState(false)
  const [addCustomerMsg, setAddCustomerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      const storeId = (session.user as any).id
      fetch(`/api/stores/${storeId}/customers?page=1&limit=${CUSTOMERS_LIMIT}`)
        .then(r => r.json())
        .then(data => {
          const list = data?.customers ?? (Array.isArray(data) ? data : [])
          setCustomers(list)
          setCustomersTotal(data?.total ?? list.length)
          setCustomersPage(1)
          setCustomersHasMore((data?.total ?? list.length) > CUSTOMERS_LIMIT)
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }
  }, [status, session])

  async function loadMoreCustomers() {
    setLoadingMore(true)
    const storeId = (session?.user as any).id
    const nextPage = customersPage + 1
    try {
      const res = await fetch(`/api/stores/${storeId}/customers?page=${nextPage}&limit=${CUSTOMERS_LIMIT}`)
      const data = await res.json()
      const list = data?.customers ?? (Array.isArray(data) ? data : [])
      setCustomers(prev => [...prev, ...list])
      setCustomersPage(nextPage)
      setCustomersHasMore(nextPage * CUSTOMERS_LIMIT < (data?.total ?? 0))
    } catch { /* ignore */ }
    setLoadingMore(false)
  }

  async function handleAddCustomer(e: React.FormEvent) {
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
          password: addCustomerForm.password,
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
      await res.json()

      // サーバー側で自動的に当該店舗へ割り当て済み
      const storeId = (session?.user as any).id

      // 顧客一覧を再取得
      const listRes = await fetch(`/api/stores/${storeId}/customers?page=1&limit=${CUSTOMERS_LIMIT}`)
      const listData = await listRes.json()
      const list = listData?.customers ?? (Array.isArray(listData) ? listData : [])
      setCustomers(list)
      setCustomersTotal(listData?.total ?? list.length)
      setCustomersPage(1)
      setCustomersHasMore((listData?.total ?? list.length) > CUSTOMERS_LIMIT)

      setAddCustomerMsg({ type: 'success', text: `${addCustomerForm.name} 様を追加しました` })
      setAddCustomerForm({ name: '', furigana: '', email: '', phone: '', address: '', password: '' })
      setTimeout(() => setShowAddCustomer(false), 1200)
    } catch {
      setAddCustomerMsg({ type: 'error', text: '顧客の作成に失敗しました' })
    }
    setAddCustomerSubmitting(false)
  }

  const filtered = customers.filter(c =>
    c.name.includes(search) || c.furigana.includes(search) ||
    c.email?.includes(search) || c.phone.includes(search)
  )

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
  ]

  return (
    <>
      <AppBar
        title="担当顧客"
        subtitle={`${customers.length}名`}
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
              onClick={() => { setShowAddCustomer(true); setAddCustomerMsg(null); setAddCustomerForm({ name: '', furigana: '', email: '', phone: '', address: '', password: '' }) }}
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
            emptyTitle={customers.length === 0 ? '担当顧客がいません' : '検索結果がありません'}
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

      {/* 新規顧客追加モーダル */}
      <Modal
        open={showAddCustomer}
        onClose={() => setShowAddCustomer(false)}
        title="新規顧客追加"
      >
        <form onSubmit={handleAddCustomer} className="space-y-4">
          {addCustomerMsg && (
            <MessageBanner severity={addCustomerMsg.type} dismissible onDismiss={() => setAddCustomerMsg(null)}>
              {addCustomerMsg.text}
            </MessageBanner>
          )}
          <TextField
            label="氏名"
            value={addCustomerForm.name}
            onChange={v => setAddCustomerForm(f => ({ ...f, name: v }))}
            required
            placeholder="山田 太郎"
          />
          <TextField
            label="ふりがな"
            value={addCustomerForm.furigana}
            onChange={v => setAddCustomerForm(f => ({ ...f, furigana: v }))}
            required
            placeholder="やまだ たろう"
          />
          <TextField
            label="メールアドレス（任意）"
            type="email"
            value={addCustomerForm.email}
            onChange={v => setAddCustomerForm(f => ({ ...f, email: v }))}
            placeholder="taro@example.com"
          />
          <TextField
            label="電話番号"
            type="tel"
            value={addCustomerForm.phone}
            onChange={v => setAddCustomerForm(f => ({ ...f, phone: v }))}
            required
            placeholder="090-1234-5678"
          />
          <TextField
            label="住所"
            value={addCustomerForm.address}
            onChange={v => setAddCustomerForm(f => ({ ...f, address: v }))}
            required
            placeholder="東京都渋谷区..."
          />
          <TextField
            label="パスワード"
            type="password"
            value={addCustomerForm.password}
            onChange={v => setAddCustomerForm(f => ({ ...f, password: v }))}
            required
            placeholder="8文字以上"
          />
          {addCustomerForm.password.length > 0 && addCustomerForm.password.length < 8 && (
            <p className="text-xs text-[var(--md-sys-color-error,#B3261E)]">パスワードは8文字以上で入力してください</p>
          )}
          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              variant="filled"
              loading={addCustomerSubmitting}
              disabled={addCustomerSubmitting || addCustomerForm.password.length < 8}
              fullWidth
            >
              {addCustomerSubmitting ? '登録中...' : '登録する'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}
