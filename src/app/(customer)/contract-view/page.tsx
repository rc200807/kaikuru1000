'use client'

import { useEffect, useState, Suspense, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

interface ContractData {
  id: string
  visitDate: string
  status: string
  purchaseAmount: number | null
  billingAmount: number | null
  staffName: string | null
  user: {
    id: string
    name: string
    phone: string
    address: string
    email: string | null
    idAddress: string | null
    idName: string | null
  }
  store: {
    id: string
    name: string
    address: string
    phone: string
  }
  purchaseItems: {
    id: string
    itemName: string
    category: string
    quantity: number
    purchasePrice: number
  }[]
  workItems: {
    id: string
    workName: string
    unitPrice: number
    quantity: number
  }[]
  salesContract: {
    id: string
    agreedAt: string
    signatureData: string
  } | null
  createdAt: string
}

function ContractViewContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const visitId = searchParams.get('id')

  const [contract, setContract] = useState<ContractData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [magicAuth, setMagicAuth] = useState<{ userId: string; contractId: string | null; user: any } | null>(null)

  // Email registration state
  const [emailInput, setEmailInput] = useState('')
  const [emailSubmitting, setEmailSubmitting] = useState(false)
  const [emailSuccess, setEmailSuccess] = useState(false)
  const [emailError, setEmailError] = useState('')

  const fetchContract = useCallback(async (vId: string, userId: string) => {
    try {
      const res = await fetch(`/api/magic-link/contract?visitId=${vId}&userId=${userId}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '契約データの取得に失敗しました')
      } else {
        setContract(data)
      }
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Check magic auth
    const stored = sessionStorage.getItem('magicAuth')
    if (!stored) {
      router.replace('/login')
      return
    }

    try {
      const auth = JSON.parse(stored)
      setMagicAuth(auth)

      const id = visitId || auth.contractId
      if (!id) {
        setError('契約IDが指定されていません')
        setLoading(false)
        return
      }

      fetchContract(id, auth.userId)
    } catch {
      router.replace('/login')
    }
  }, [visitId, router, fetchContract])

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!magicAuth || !emailInput.trim()) return

    setEmailSubmitting(true)
    setEmailError('')

    try {
      const res = await fetch(`/api/users/${magicAuth.userId}/set-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput.trim() }),
      })

      const data = await res.json()
      if (!res.ok) {
        setEmailError(data.error || 'メールアドレスの登録に失敗しました')
      } else {
        setEmailSuccess(true)
      }
    } catch {
      setEmailError('通信エラーが発生しました')
    } finally {
      setEmailSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-10 h-10 border-4 border-gray-200 border-t-[#B91C1C] rounded-full animate-spin mb-4" />
          <p className="text-gray-600 text-sm">契約書を読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">エラー</h1>
          <p className="text-gray-600 text-sm">{error}</p>
        </div>
      </div>
    )
  }

  if (!contract) return null

  const visitDate = new Date(contract.visitDate)
  const contractDate = contract.salesContract
    ? new Date(contract.salesContract.agreedAt)
    : visitDate
  const coolingOffDate = new Date(contractDate)
  coolingOffDate.setDate(coolingOffDate.getDate() + 8)

  const purchaseTotal = contract.purchaseItems.reduce(
    (sum, item) => sum + item.purchasePrice * item.quantity,
    0
  )
  const workTotal = contract.workItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  )
  const finalPayment = purchaseTotal - workTotal

  const formatDate = (date: Date) =>
    `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`

  const formatCurrency = (n: number) =>
    n.toLocaleString('ja-JP')

  const customerName = contract.user.idName || contract.user.name
  const customerAddress = contract.user.idAddress || contract.user.address

  return (
    <div className="min-h-screen bg-gray-100 py-6 px-4">
      <div className="max-w-2xl mx-auto">

        {/* Email registration banner */}
        {!contract.user.email && !emailSuccess && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <p className="text-amber-800 text-sm font-medium mb-3">
              メールアドレスを登録すると、次回からログインしてマイページをご利用いただけます
            </p>
            <form onSubmit={handleEmailSubmit} className="flex gap-2">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="example@email.com"
                className="flex-1 px-3 py-2 border border-amber-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                required
              />
              <button
                type="submit"
                disabled={emailSubmitting}
                className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {emailSubmitting ? '登録中...' : '登録'}
              </button>
            </form>
            {emailError && (
              <p className="text-red-600 text-xs mt-2">{emailError}</p>
            )}
          </div>
        )}

        {emailSuccess && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
            <p className="text-green-800 text-sm font-medium">
              メールアドレスの登録が完了しました。パスワードをメールでお送りしました。
            </p>
          </div>
        )}

        {/* Contract document */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">

          {/* Header */}
          <div className="bg-gray-900 text-white px-6 py-5 text-center">
            <h1 className="text-xl font-bold tracking-wider">売買契約書</h1>
            <p className="text-gray-400 text-xs mt-1">
              契約日: {formatDate(contractDate)}
            </p>
          </div>

          <div className="p-6 space-y-6">

            {/* Contract date and visit date */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">訪問日</span>
                <p className="font-medium text-gray-900">{formatDate(visitDate)}</p>
              </div>
              {contract.staffName && (
                <div>
                  <span className="text-gray-500">担当者</span>
                  <p className="font-medium text-gray-900">{contract.staffName}</p>
                </div>
              )}
            </div>

            <hr className="border-gray-200" />

            {/* Customer info */}
            <div>
              <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-1 h-4 bg-[#B91C1C] rounded-full inline-block" />
                お客様情報
              </h2>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex">
                  <span className="text-gray-500 w-20 shrink-0">氏名</span>
                  <span className="text-gray-900 font-medium">{customerName}</span>
                </div>
                <div className="flex">
                  <span className="text-gray-500 w-20 shrink-0">住所</span>
                  <span className="text-gray-900">{customerAddress}</span>
                </div>
                <div className="flex">
                  <span className="text-gray-500 w-20 shrink-0">電話番号</span>
                  <span className="text-gray-900">{contract.user.phone}</span>
                </div>
                {contract.user.email && (
                  <div className="flex">
                    <span className="text-gray-500 w-20 shrink-0">メール</span>
                    <span className="text-gray-900">{contract.user.email}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Store info */}
            <div>
              <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                <span className="w-1 h-4 bg-[#B91C1C] rounded-full inline-block" />
                買取業者情報
              </h2>
              <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex">
                  <span className="text-gray-500 w-20 shrink-0">店舗名</span>
                  <span className="text-gray-900 font-medium">{contract.store.name}</span>
                </div>
                <div className="flex">
                  <span className="text-gray-500 w-20 shrink-0">住所</span>
                  <span className="text-gray-900">{contract.store.address}</span>
                </div>
                <div className="flex">
                  <span className="text-gray-500 w-20 shrink-0">電話番号</span>
                  <span className="text-gray-900">{contract.store.phone}</span>
                </div>
              </div>
            </div>

            {/* Purchase items */}
            {contract.purchaseItems.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 bg-[#B91C1C] rounded-full inline-block" />
                  買取品目
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-y border-gray-200">
                        <th className="text-left px-3 py-2 text-gray-600 font-medium">品名</th>
                        <th className="text-left px-3 py-2 text-gray-600 font-medium">カテゴリ</th>
                        <th className="text-right px-3 py-2 text-gray-600 font-medium">数量</th>
                        <th className="text-right px-3 py-2 text-gray-600 font-medium">単価</th>
                        <th className="text-right px-3 py-2 text-gray-600 font-medium">小計</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contract.purchaseItems.map((item) => (
                        <tr key={item.id} className="border-b border-gray-100">
                          <td className="px-3 py-2 text-gray-900">{item.itemName}</td>
                          <td className="px-3 py-2 text-gray-600">{item.category}</td>
                          <td className="px-3 py-2 text-gray-900 text-right">{item.quantity}</td>
                          <td className="px-3 py-2 text-gray-900 text-right">{formatCurrency(item.purchasePrice)}円</td>
                          <td className="px-3 py-2 text-gray-900 text-right font-medium">{formatCurrency(item.purchasePrice * item.quantity)}円</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td colSpan={4} className="px-3 py-2 text-right font-bold text-gray-700">買取合計</td>
                        <td className="px-3 py-2 text-right font-bold text-[#B91C1C]">{formatCurrency(purchaseTotal)}円</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Work items */}
            {contract.workItems.length > 0 && (
              <div>
                <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 bg-[#B91C1C] rounded-full inline-block" />
                  作業品目
                </h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-y border-gray-200">
                        <th className="text-left px-3 py-2 text-gray-600 font-medium">作業名</th>
                        <th className="text-right px-3 py-2 text-gray-600 font-medium">数量</th>
                        <th className="text-right px-3 py-2 text-gray-600 font-medium">単価</th>
                        <th className="text-right px-3 py-2 text-gray-600 font-medium">小計</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contract.workItems.map((item) => (
                        <tr key={item.id} className="border-b border-gray-100">
                          <td className="px-3 py-2 text-gray-900">{item.workName}</td>
                          <td className="px-3 py-2 text-gray-900 text-right">{item.quantity}</td>
                          <td className="px-3 py-2 text-gray-900 text-right">{formatCurrency(item.unitPrice)}円</td>
                          <td className="px-3 py-2 text-gray-900 text-right font-medium">{formatCurrency(item.unitPrice * item.quantity)}円</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-200">
                        <td colSpan={3} className="px-3 py-2 text-right font-bold text-gray-700">作業合計</td>
                        <td className="px-3 py-2 text-right font-bold text-gray-700">{formatCurrency(workTotal)}円</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Final payment */}
            <div className="bg-[#FFF1F2] border border-[#FECDD3] rounded-xl p-5">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-gray-600 text-xs mb-1">お支払い金額（買取金額 - 作業費用）</p>
                  <p className="text-2xl font-bold text-[#B91C1C]">
                    {formatCurrency(finalPayment)}
                    <span className="text-base font-medium ml-1">円</span>
                  </p>
                </div>
              </div>
              {purchaseTotal > 0 && workTotal > 0 && (
                <div className="mt-3 pt-3 border-t border-[#FECDD3] text-xs text-gray-600 space-y-1">
                  <div className="flex justify-between">
                    <span>買取合計</span>
                    <span>{formatCurrency(purchaseTotal)}円</span>
                  </div>
                  <div className="flex justify-between">
                    <span>作業費用</span>
                    <span>-{formatCurrency(workTotal)}円</span>
                  </div>
                </div>
              )}
            </div>

            {/* Signature */}
            {contract.salesContract?.signatureData && (
              <div>
                <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <span className="w-1 h-4 bg-[#B91C1C] rounded-full inline-block" />
                  署名
                </h2>
                <div className="border border-gray-200 rounded-lg p-4 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={contract.salesContract.signatureData}
                    alt="顧客署名"
                    className="max-h-24 mx-auto"
                  />
                </div>
              </div>
            )}

            {/* Cooling off notice */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h3 className="text-sm font-bold text-blue-800 mb-2">クーリング・オフのお知らせ</h3>
              <p className="text-xs text-blue-700 leading-relaxed">
                本契約は、特定商取引法に基づく訪問購入に該当します。
                契約書面を受領した日（{formatDate(contractDate)}）から
                <strong>8日間</strong>（{formatDate(coolingOffDate)}まで）は、
                書面により無条件で契約を解除（クーリング・オフ）することができます。
                クーリング・オフ期間中は、物品の引渡しを拒むことができます。
              </p>
            </div>

            {/* Legal note */}
            <p className="text-xs text-gray-400 text-center leading-relaxed">
              本契約書は特定商取引法第58条の7に基づき交付されるものです。
            </p>
          </div>
        </div>

        {/* マイページへの導線 */}
        <div className="mt-6 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 text-center">
          <p className="text-sm text-gray-600 mb-4">
            マイページでは、契約履歴の確認や各種設定が行えます
          </p>
          <a
            href="/mypage"
            className="inline-block w-full max-w-xs py-3 rounded-full bg-[#B91C1C] text-white font-medium text-sm hover:bg-[#991B1B] transition-colors"
          >
            マイページへ
          </a>
        </div>
      </div>
    </div>
  )
}

export default function ContractViewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-10 h-10 border-4 border-gray-200 border-t-[#B91C1C] rounded-full animate-spin mb-4" />
          <p className="text-gray-600 text-sm">読み込み中...</p>
        </div>
      </div>
    }>
      <ContractViewContent />
    </Suspense>
  )
}
