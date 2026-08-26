'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import AppBar from '@/components/AppBar'
import Button from '@/components/Button'
import Modal from '@/components/Modal'
import LoadingSpinner from '@/components/LoadingSpinner'
import MessageBanner from '@/components/MessageBanner'
import { useToast } from '@/components/Toast'
import {
  KOBUTSU_CATEGORIES,
  KOBUTSU_CATEGORY_LABEL,
  KOBUTSU_MISSING_LABEL,
  formatBirthDate,
  type KobutsuCategoryKey,
  type KobutsuLedgerGroup,
  type KobutsuLedgerRow,
} from '@/lib/kobutsu-ledger'
import { formatJstDate, formatJstDateTime } from '@/lib/datetime'
import { formatDealNumber } from '@/lib/deal-number'

type StoreInfo = { name: string; code: string; antiquePermitNumber: string | null }

const fmtYen = (n: number) => `¥${(n ?? 0).toLocaleString()}`
const fmtDate = (iso: string) => formatJstDate(iso, { year: 'numeric', month: '2-digit', day: '2-digit' })

/** 台帳1項目（案件）の詳細。品目ごとの明細一覧と記載（補記）の編集を行う */
export default function KobutsuLedgerDetailPage() {
  const { status: authStatus } = useSession()
  const router = useRouter()
  const params = useParams<{ contractId: string }>()
  const contractId = params.contractId
  const { success, error: toastError } = useToast()

  const [group, setGroup] = useState<KobutsuLedgerGroup | null>(null)
  const [store, setStore] = useState<StoreInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // 記載（補記）モーダル
  const [editRow, setEditRow] = useState<KobutsuLedgerRow | null>(null)
  const [editCategory, setEditCategory] = useState<KobutsuCategoryKey | ''>('')
  const [editFeatures, setEditFeatures] = useState('')
  const [editNote, setEditNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (authStatus === 'unauthenticated') router.push('/store/login')
  }, [authStatus, router])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/store/kobutsu-ledger/contracts/${contractId}`)
      if (res.status === 404) {
        setNotFound(true)
      } else if (res.ok) {
        const data = await res.json()
        setGroup(data.group ?? null)
        setStore(data.store ?? null)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [contractId])

  useEffect(() => {
    if (authStatus === 'authenticated') load()
  }, [authStatus, load])

  function openEdit(row: KobutsuLedgerRow) {
    setEditRow(row)
    setEditCategory(row.categoryManual && row.categoryKey ? row.categoryKey : '')
    setEditFeatures(row.featuresManual ? row.features : '')
    setEditNote(row.note ?? '')
  }

  async function saveEdit() {
    if (!editRow) return
    setSaving(true)
    try {
      const res = await fetch(`/api/store/kobutsu-ledger/items/${editRow.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kobutsuCategory: editCategory || null,
          features: editFeatures.trim() || null,
          note: editNote.trim() || null,
        }),
      })
      if (res.ok) {
        success('台帳の記載を保存しました')
        setEditRow(null)
        load()
      } else {
        const data = await res.json().catch(() => ({}))
        toastError(data.error || '保存に失敗しました')
      }
    } catch {
      toastError('保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  if (authStatus === 'loading' || loading) return <LoadingSpinner size="lg" fullPage />

  if (notFound || !group) {
    return (
      <div className="flex flex-col">
        <AppBar title="古物台帳" subtitle="台帳詳細" />
        <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 space-y-4">
          <MessageBanner severity="error" dismissible={false}>台帳の記録が見つかりません</MessageBanner>
          <Link href="/store/kobutsu-ledger" className="text-sm text-[var(--store-primary)] hover:underline">← 古物台帳へ戻る</Link>
        </div>
      </div>
    )
  }

  const rows = group.rows ?? []

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 56px)' }}>
      <AppBar
        title="古物台帳（買受け）"
        subtitle={`${fmtDate(group.tradedAt)} ・ ${group.customer.name} 様`}
        actions={
          <Link href="/store/kobutsu-ledger" className="text-xs text-[var(--md-sys-color-on-surface-variant)] hover:underline whitespace-nowrap">
            ← 一覧
          </Link>
        }
      />

      <div className="max-w-4xl w-full mx-auto px-4 sm:px-6 py-4 flex flex-col gap-3">
        {group.missing.length > 0 && (
          <MessageBanner severity="warning" dismissible={false}>
            法定記載事項に不足があります（{group.missing.map(m => KOBUTSU_MISSING_LABEL[m]).join('・')}）。
            品目・特徴は下の「記載」から、住所・職業・年齢・確認方法は顧客情報から補ってください。
          </MessageBanner>
        )}

        {/* 台帳ヘッダー（取引・営業所・相手方） */}
        <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <Row label="取引年月日" value={fmtDate(group.tradedAt)} sub={formatJstDateTime(group.tradedAt)} />
            <Row label="区別" value={group.tradeType} />
            <Row label="案件番号" value={formatDealNumber(group.dealNumber)} />
            <Row label="営業所" value={store ? `${store.name}（${store.code}）` : '—'} />
            <Row label="古物商許可番号" value={store?.antiquePermitNumber || '（未登録）'} warn={!store?.antiquePermitNumber} />
            <Row label="相手方の氏名" value={group.customer.name} />
            <Row label="相手方の住所" value={group.customer.address || '未登録'} warn={!group.customer.address} />
            <Row label="相手方の職業" value={group.customer.occupation || '未登録'} warn={!group.customer.occupation} />
            <Row
              label="相手方の生年月日"
              value={formatBirthDate(group.customer.birthDate) || '未登録'}
              warn={!group.customer.birthDate}
            />
            <Row
              label="相手方の年齢"
              value={group.customer.age != null ? `${group.customer.age}歳` : '未登録'}
              warn={group.customer.age == null}
            />
            <Row label="確認方法" value={group.customer.verification || '未確認'} warn={!group.customer.verification} />
            <Row label="合計" value={`${group.itemCount}品目 / ${group.quantity}点 / ${fmtYen(group.total)}`} />
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-[var(--md-sys-color-outline-variant)]">
            {group.dealId && (
              <Link href={`/store/deals/${group.dealId}`} className="text-xs text-[var(--store-primary)] hover:underline">
                案件詳細を開く →
              </Link>
            )}
            <Link href={`/store/customers?focus=${group.customer.id}`} className="text-xs text-[var(--store-primary)] hover:underline">
              顧客情報を開く →
            </Link>
          </div>
        </div>

        {/* 明細（品目ごと） */}
        <div className="rounded-xl border border-[var(--md-sys-color-outline-variant)] overflow-hidden">
          <div className="px-3 py-2 bg-[var(--md-sys-color-surface-container)] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--md-sys-color-on-surface)] whitespace-nowrap">台帳の明細（{rows.length}品目）</h2>
            <span className="hidden sm:inline text-[11px] text-[var(--md-sys-color-on-surface-variant)]">品目・特徴は「記載」から編集できます</span>
          </div>

          {/* PC: 表 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[var(--md-sys-color-surface-container-low)]">
                <tr>
                  {['#', '品目（法定13品目）', '品名', '特徴', '数量', '単価', '代価', '備考', ''].map(h => (
                    <th key={h} className="px-2.5 py-2 text-left font-semibold text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, idx) => (
                  <tr key={r.id} className="border-t border-[var(--md-sys-color-outline-variant)] align-top">
                    <td className="px-2.5 py-2 text-[var(--md-sys-color-on-surface-faint)]">{idx + 1}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">
                      {r.categoryKey ? (
                        <span className="text-[var(--md-sys-color-on-surface)]">
                          {KOBUTSU_CATEGORY_LABEL[r.categoryKey]}
                          {!r.categoryManual && <span className="ml-1 text-[10px] text-[var(--md-sys-color-on-surface-faint)]">推定</span>}
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">未設定</span>
                      )}
                    </td>
                    <td className="px-2.5 py-2 font-medium text-[var(--md-sys-color-on-surface)] min-w-[140px]">{r.itemName}</td>
                    <td className="px-2.5 py-2 min-w-[240px] text-[var(--md-sys-color-on-surface-variant)] break-words">
                      {r.features || <span className="text-amber-600 dark:text-amber-400">未記載</span>}
                      {r.featuresManual && <span className="ml-1 text-[10px] text-[var(--md-sys-color-on-surface-faint)]">手入力</span>}
                    </td>
                    <td className="px-2.5 py-2 whitespace-nowrap text-[var(--md-sys-color-on-surface)]">{r.quantity}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap text-[var(--md-sys-color-on-surface-variant)]">{fmtYen(r.unitPrice)}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap font-medium text-[var(--md-sys-color-on-surface)]">{fmtYen(r.price)}</td>
                    <td className="px-2.5 py-2 max-w-[160px] text-[var(--md-sys-color-on-surface-variant)] break-words">{r.note || '—'}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap">
                      <button onClick={() => openEdit(r)} className="text-[var(--store-primary)] hover:underline">記載</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
                  <td className="px-2.5 py-2 font-semibold text-[var(--md-sys-color-on-surface-variant)]" colSpan={4}>合計</td>
                  <td className="px-2.5 py-2 font-semibold text-[var(--md-sys-color-on-surface)]">{group.quantity}</td>
                  <td />
                  <td className="px-2.5 py-2 font-semibold text-[var(--md-sys-color-on-surface)]">{fmtYen(group.total)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* モバイル: カード */}
          <div className="md:hidden divide-y divide-[var(--md-sys-color-outline-variant)]">
            {rows.map((r, idx) => (
              <div key={r.id} className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">
                      <span className="text-[var(--md-sys-color-on-surface-faint)] mr-1">{idx + 1}.</span>
                      {r.itemName}
                      <span className="ml-1.5 text-xs font-normal text-[var(--md-sys-color-on-surface-variant)]">×{r.quantity}</span>
                    </div>
                    <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-0.5">
                      品目: {r.categoryKey ? KOBUTSU_CATEGORY_LABEL[r.categoryKey] : '未設定'}
                      {r.categoryKey && !r.categoryManual && '（推定）'}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-[var(--md-sys-color-on-surface)] whitespace-nowrap">{fmtYen(r.price)}</span>
                </div>
                <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1 break-words">
                  特徴: {r.features || '未記載'}
                </div>
                {r.note && <div className="text-[11px] text-[var(--md-sys-color-on-surface-variant)]">備考: {r.note}</div>}
                <button onClick={() => openEdit(r)} className="text-xs text-[var(--store-primary)] font-medium mt-2">記載を編集</button>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
          この画面は古物営業法16条の帳簿（別記様式第15号）1項目分の記載内容です。
          品目の「推定」は品名・カテゴリからの自動判定なので、法定13品目の確定は「記載」から指定してください。
        </p>
      </div>

      {/* 記載（補記）モーダル */}
      <Modal
        open={!!editRow}
        onClose={() => setEditRow(null)}
        title="台帳の記載を編集"
        size="md"
        footer={
          <>
            <Button variant="text" onClick={() => setEditRow(null)}>キャンセル</Button>
            <Button onClick={saveEdit} loading={saving}>保存</Button>
          </>
        }
      >
        {editRow && (
          <div className="space-y-4">
            <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
              {fmtDate(editRow.tradedAt)} ・ {editRow.itemName} ・ {fmtYen(editRow.price)}
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">品目（法定13品目）</label>
              <select
                value={editCategory}
                onChange={e => setEditCategory(e.target.value as KobutsuCategoryKey | '')}
                className="w-full px-2 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)]"
              >
                <option value="">
                  自動推定に任せる{editRow.categoryKey && !editRow.categoryManual ? `（現在: ${KOBUTSU_CATEGORY_LABEL[editRow.categoryKey]}）` : ''}
                </option>
                {KOBUTSU_CATEGORIES.map(c => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">古物の特徴</label>
              <textarea
                value={editFeatures}
                onChange={e => setEditFeatures(e.target.value)}
                rows={3}
                placeholder={`未入力なら自動生成: ${editRow.features || '（生成できる情報がありません）'}`}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] resize-y"
              />
              <p className="text-[11px] text-[var(--md-sys-color-on-surface-variant)] mt-1">
                メーカー名・ブランド名・型番・シリアル番号・色・材質・傷など、品物を特定できる情報を記載します。
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[var(--md-sys-color-on-surface)] mb-1">備考</label>
              <textarea
                value={editNote}
                onChange={e => setEditNote(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container)] text-[var(--md-sys-color-on-surface)] resize-y"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Row({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="flex gap-3">
      <span className="w-28 flex-shrink-0 text-[var(--md-sys-color-on-surface-variant)] text-xs pt-0.5">{label}</span>
      <span className="min-w-0 flex-1">
        <span className={`text-sm break-words ${warn ? 'text-amber-600 dark:text-amber-400' : 'text-[var(--md-sys-color-on-surface)]'}`}>{value}</span>
        {sub && <span className="block text-[11px] text-[var(--md-sys-color-on-surface-faint)]">{sub}</span>}
      </span>
    </div>
  )
}
