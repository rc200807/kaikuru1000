'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import Button from '@/components/Button'
import StatusBadge from '@/components/StatusBadge'
import LoadingSpinner from '@/components/LoadingSpinner'
import MessageBanner from '@/components/MessageBanner'

type PurchaseItem = { id: string; itemName: string; category: string; quantity: number; purchasePrice: number; imageUrls: string[] }
type WorkItem = { id: string; workName: string; unitPrice: number; quantity: number }
type VisitDetail = {
  id: string
  visitDate: string
  status: string
  note: string | null
  purchaseAmount: number | null
  billingAmount: number | null
  user: { id: string; name: string; furigana?: string; address: string; phone: string; email?: string }
  store: { id: string; name: string }
  purchaseItems: PurchaseItem[]
  workItems: WorkItem[]
}
type ContractInfo = {
  id: string
  agreedAt: string
  emailSentAt: string | null
  customerEmail: string | null
  pdfBase64?: string | null
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return `¥${n.toLocaleString()}`
}

export default function AdminVisitDetailPage() {
  const { status } = useSession()
  const router = useRouter()
  const params = useParams()
  const visitId = params.id as string

  const [visit, setVisit] = useState<VisitDetail | null>(null)
  const [contract, setContract] = useState<ContractInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    const [visitRes, contractRes] = await Promise.all([
      fetch(`/api/visit-schedules/${visitId}`),
      fetch(`/api/visit-schedules/${visitId}/contract`),
    ])
    if (!visitRes.ok) {
      setError('訪問データが見つかりません')
      setLoading(false)
      return
    }
    const visitData = await visitRes.json()
    setVisit(visitData)
    if (contractRes.ok) {
      const contractData = await contractRes.json()
      setContract(contractData)
    }
    setLoading(false)
  }, [visitId])

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') fetchData()
  }, [status, fetchData])

  if (status === 'loading' || loading) return <LoadingSpinner size="lg" fullPage />

  if (error || !visit) {
    return (
      <div className="p-6">
        <MessageBanner severity="error">{error ?? '訪問データが見つかりません'}</MessageBanner>
        <Button variant="text" onClick={() => router.push('/admin/visits')} className="mt-4">← 訪問一覧に戻る</Button>
      </div>
    )
  }

  const purchaseTotal = visit.purchaseItems.reduce((s, i) => s + i.purchasePrice * i.quantity, 0)
  const workTotal = visit.workItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)

  return (
    <>
      <AppBar
        title="訪問詳細"
        subtitle={`${visit.user.name} 様 — ${format(new Date(visit.visitDate), 'yyyy年M月d日（E）', { locale: ja })}`}
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* 戻るボタン */}
        <Button variant="text" size="sm" onClick={() => router.push('/admin/visits')}>
          ← 訪問一覧に戻る
        </Button>

        {/* 基本情報 */}
        <Card variant="elevated" padding="md">
          <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">訪問情報</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {[
              { label: '訪問日', value: format(new Date(visit.visitDate), 'yyyy年M月d日（E）', { locale: ja }) },
              { label: '担当店舗', value: visit.store.name },
              { label: 'ステータス', value: <StatusBadge status={visit.status as any} /> },
              { label: 'メモ', value: visit.note ?? '—' },
            ].map(item => (
              <div key={item.label} className="flex gap-3">
                <dt className="w-24 text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">{item.label}</dt>
                <dd className="text-[var(--md-sys-color-on-surface)] min-w-0">{item.value}</dd>
              </div>
            ))}
          </div>
        </Card>

        {/* 顧客情報 */}
        <Card variant="elevated" padding="md">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">顧客情報</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {[
              { label: '氏名', value: visit.user.name },
              { label: '電話番号', value: visit.user.phone },
              { label: '住所', value: visit.user.address },
              ...(visit.user.email ? [{ label: 'メール', value: visit.user.email }] : []),
            ].map(item => (
              <div key={item.label} className="flex gap-3">
                <dt className="w-24 text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">{item.label}</dt>
                <dd className="text-[var(--md-sys-color-on-surface)] break-all min-w-0">{item.value}</dd>
              </div>
            ))}
          </div>
        </Card>

        {/* 買取品目 */}
        {visit.purchaseItems.length > 0 && (
          <Card variant="elevated" padding="md">
            <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">買取品目</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
                  <th className="text-left py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">品名</th>
                  <th className="text-left py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">カテゴリー</th>
                  <th className="text-right py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">数量</th>
                  <th className="text-right py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">単価</th>
                  <th className="text-right py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">小計</th>
                </tr>
              </thead>
              <tbody>
                {visit.purchaseItems.map(item => (
                  <tr key={item.id} className="border-b border-[var(--md-sys-color-outline-variant)]/50">
                    <td className="py-1.5 text-[var(--md-sys-color-on-surface)]">{item.itemName}</td>
                    <td className="py-1.5 text-[var(--md-sys-color-on-surface-variant)]">{item.category}</td>
                    <td className="py-1.5 text-right">{item.quantity}</td>
                    <td className="py-1.5 text-right">{fmt(item.purchasePrice)}</td>
                    <td className="py-1.5 text-right font-medium">{fmt(item.purchasePrice * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="py-2 text-right font-bold text-[var(--md-sys-color-on-surface)]">買取金額合計</td>
                  <td className="py-2 text-right font-bold text-lg text-[var(--portal-primary)]">{fmt(purchaseTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </Card>
        )}

        {/* 作業品目 */}
        {visit.workItems.length > 0 && (
          <Card variant="elevated" padding="md">
            <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">作業品目</h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--md-sys-color-outline-variant)]">
                  <th className="text-left py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">作業名</th>
                  <th className="text-right py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">数量</th>
                  <th className="text-right py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">単価</th>
                  <th className="text-right py-1.5 font-medium text-[var(--md-sys-color-on-surface-variant)]">小計</th>
                </tr>
              </thead>
              <tbody>
                {visit.workItems.map(item => (
                  <tr key={item.id} className="border-b border-[var(--md-sys-color-outline-variant)]/50">
                    <td className="py-1.5 text-[var(--md-sys-color-on-surface)]">{item.workName}</td>
                    <td className="py-1.5 text-right">{item.quantity}</td>
                    <td className="py-1.5 text-right">{fmt(item.unitPrice)}</td>
                    <td className="py-1.5 text-right font-medium">{fmt(item.unitPrice * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="py-2 text-right font-bold text-[var(--md-sys-color-on-surface)]">作業費合計</td>
                  <td className="py-2 text-right font-bold text-lg text-[var(--md-sys-color-on-surface)]">{fmt(workTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </Card>
        )}

        {/* 金額サマリー */}
        {(visit.purchaseItems.length > 0 || visit.workItems.length > 0) && (
          <Card variant="elevated" padding="md">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">お支払い金額（買取額 - 作業費）</span>
              <span className="text-xl font-bold text-[var(--portal-primary)]">{fmt(purchaseTotal - workTotal)}</span>
            </div>
          </Card>
        )}

        {/* 売買契約書 */}
        <Card variant="elevated" padding="md">
          <h2 className="text-sm font-bold text-[var(--md-sys-color-on-surface)] mb-3">売買契約書</h2>
          {contract ? (
            <div className="space-y-2">
              <div className="flex gap-3 text-sm">
                <dt className="w-28 text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">同意日時</dt>
                <dd className="text-[var(--md-sys-color-on-surface)]">{format(new Date(contract.agreedAt), 'yyyy年M月d日 HH:mm', { locale: ja })}</dd>
              </div>
              <div className="flex gap-3 text-sm">
                <dt className="w-28 text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">メール送信</dt>
                <dd className="text-[var(--md-sys-color-on-surface)]">
                  {contract.emailSentAt
                    ? format(new Date(contract.emailSentAt), 'yyyy年M月d日 HH:mm', { locale: ja })
                    : '未送信'}
                </dd>
              </div>
              {contract.customerEmail && (
                <div className="flex gap-3 text-sm">
                  <dt className="w-28 text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0">送信先</dt>
                  <dd className="text-[var(--md-sys-color-on-surface)]">{contract.customerEmail}</dd>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--md-sys-color-on-surface-variant)]">契約書はまだ作成されていません</p>
          )}
        </Card>
      </div>
    </>
  )
}
