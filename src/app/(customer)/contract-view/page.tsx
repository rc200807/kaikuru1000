'use client'

import { useEffect, useState, Suspense, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { storeContractName } from '@/lib/operator-utils'
import GlassInput from '@/components/customer/GlassInput'
import GlassButton from '@/components/customer/GlassButton'

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
  hasPdf?: boolean
  hasInvoicePdf?: boolean
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
  const cardRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)
  const [pdfError, setPdfError] = useState('')

  // 表示中の契約書をその場でPDF化してダウンロード（保存済みPDFの有無に依存しない）
  const handleDownloadPdf = useCallback(async () => {
    const el = cardRef.current
    if (!el) return
    setDownloading(true)
    setPdfError('')
    try {
      const { elementToPdf } = await import('@/lib/pdf-export')
      const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      // 要素のブロック境界で改ページするため文字が途中で切れない
      await elementToPdf(el, { mode: 'save', filename: `売買契約書_${ymd}.pdf` })
    } catch (e) {
      console.error('PDF生成エラー:', e)
      setPdfError('PDFの生成に失敗しました。お手数ですが、時間をおいて再度お試しください。')
    } finally {
      setDownloading(false)
    }
  }, [])

  // Email registration state
  const [emailInput, setEmailInput] = useState('')
  const [emailSubmitting, setEmailSubmitting] = useState(false)
  const [emailSuccess, setEmailSuccess] = useState(false)
  const [emailError, setEmailError] = useState('')

  const fetchContract = useCallback(async (vId: string, userId?: string) => {
    try {
      const url = userId
        ? `/api/magic-link/contract?visitId=${vId}&userId=${userId}`
        : `/api/magic-link/contract?visitId=${vId}`
      const res = await fetch(url)
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
    // まずsessionStorageのmagicAuthを確認
    const stored = typeof window !== 'undefined' ? sessionStorage.getItem('magicAuth') : null
    if (stored) {
      try {
        const auth = JSON.parse(stored)
        setMagicAuth(auth)
        const id = visitId || auth.contractId
        if (!id) {
          setError('契約IDが見つかりません')
          setLoading(false)
          return
        }
        fetchContract(id, auth.userId)
        return
      } catch { /* fall through */ }
    }

    // magicAuthがない場合、visitIdがあればNextAuthセッションで取得
    if (visitId) {
      fetchContract(visitId)
      return
    }

    // どちらもない場合はログインページへ
    router.replace('/login')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId])

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
      <div className="min-h-screen bg-gradient-to-b from-pink-50/50 via-white to-purple-50/50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-10 h-10 border-4 border-gray-200 border-t-[#B91C1C] rounded-full animate-spin mb-4" />
          <p className="text-gray-600 text-sm">契約書を読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-pink-50/50 via-white to-purple-50/50 flex items-center justify-center p-4">
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-sm p-8 max-w-md w-full text-center">
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
  // 差し引き（買取−請求）は表示しない。売買契約書と請求書はそれぞれ独立した書類として扱う。
  const invoiceVisitId = visitId || magicAuth?.contractId || contract.id
  const invoicePdfHref = `/api/magic-link/document-pdf?type=contract&kind=invoice&visitId=${invoiceVisitId}${magicAuth?.userId ? `&userId=${magicAuth.userId}` : ''}`

  const formatDate = (date: Date) =>
    `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`

  const formatCurrency = (n: number) =>
    n.toLocaleString('ja-JP')

  const customerName = contract.user.idName || contract.user.name
  const customerAddress = contract.user.idAddress || contract.user.address

  return (
    <div className="min-h-screen bg-gradient-to-b from-pink-50/50 via-white to-purple-50/50 p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">

        {/* Email registration banner */}
        {!contract.user.email && !emailSuccess && (
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-amber-200/50 p-5 mb-6">
            <p className="text-amber-800 text-sm font-medium mb-3">
              メールアドレスを登録すると、次回からログインしてマイページをご利用いただけます
            </p>
            <form onSubmit={handleEmailSubmit} className="flex gap-2 items-end">
              <div className="flex-1">
                <GlassInput
                  label="メールアドレス"
                  type="email"
                  value={emailInput}
                  onChange={setEmailInput}
                  placeholder="example@email.com"
                  required
                />
              </div>
              <GlassButton
                type="submit"
                disabled={emailSubmitting}
                loading={emailSubmitting}
                fullWidth={false}
                className="px-6"
              >
                登録
              </GlassButton>
            </form>
            {emailError && (
              <p className="text-red-600 text-xs mt-2">{emailError}</p>
            )}
          </div>
        )}

        {emailSuccess && (
          <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-green-200/50 p-5 mb-6">
            <p className="text-green-800 text-sm font-medium">
              メールアドレスの登録が完了しました。パスワードをメールでお送りしました。
            </p>
          </div>
        )}

        {/* Contract document */}
        <div ref={cardRef} className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-sm p-6 sm:p-8">

          {/* Header */}
          <div className="bg-gray-900 text-white px-6 py-5 text-center rounded-xl mb-6">
            <h1 className="text-xl font-bold tracking-wider">売買契約書</h1>
            <p className="text-gray-400 text-xs mt-1">
              契約日: {formatDate(contractDate)}
            </p>
          </div>

          <div className="space-y-6">

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

            <hr className="border-white/60" />

            {/* Customer info */}
            <div>
              <h2 className="text-sm font-bold text-red-500 mb-3 uppercase tracking-wider">
                お客様情報
              </h2>
              <div className="bg-white/40 rounded-xl p-4 space-y-2 text-sm">
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
              <h2 className="text-sm font-bold text-red-500 mb-3 uppercase tracking-wider">
                買取業者情報
              </h2>
              <div className="bg-white/40 rounded-xl p-4 space-y-2 text-sm">
                <div className="flex">
                  <span className="text-gray-500 w-20 shrink-0">店舗名</span>
                  <span className="text-gray-900 font-medium">{storeContractName(contract.store.name)}</span>
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
                <h2 className="text-sm font-bold text-red-500 mb-3 uppercase tracking-wider">
                  買取品目
                </h2>
                <div className="bg-white/40 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-white/30 border-b border-white/60">
                        <th className="text-left px-3 py-2 text-gray-600 font-medium">品名</th>
                        <th className="text-left px-3 py-2 text-gray-600 font-medium">カテゴリ</th>
                        <th className="text-right px-3 py-2 text-gray-600 font-medium">数量</th>
                        <th className="text-right px-3 py-2 text-gray-600 font-medium">単価</th>
                        <th className="text-right px-3 py-2 text-gray-600 font-medium">小計</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contract.purchaseItems.map((item) => (
                        <tr key={item.id} className="border-b border-white/40">
                          <td className="px-3 py-2 text-gray-900">{item.itemName}</td>
                          <td className="px-3 py-2 text-gray-600">{item.category}</td>
                          <td className="px-3 py-2 text-gray-900 text-right">{item.quantity}</td>
                          <td className="px-3 py-2 text-gray-900 text-right">{formatCurrency(item.purchasePrice)}円</td>
                          <td className="px-3 py-2 text-gray-900 text-right font-medium">{formatCurrency(item.purchasePrice * item.quantity)}円</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-white/30 border-t border-white/60">
                        <td colSpan={4} className="px-3 py-2 text-right font-bold text-gray-700">買取合計</td>
                        <td className="px-3 py-2 text-right font-bold text-[#B91C1C]">{formatCurrency(purchaseTotal)}円</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Signature */}
            {contract.salesContract?.signatureData && (
              <div>
                <h2 className="text-sm font-bold text-red-500 mb-3 uppercase tracking-wider">
                  署名
                </h2>
                <div className="border border-white/60 rounded-xl p-4 bg-white/40">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={contract.salesContract.signatureData}
                    alt="顧客署名"
                    className="max-h-24 mx-auto"
                  />
                </div>
              </div>
            )}

            {/* 特商法書面・クーリングオフ全文 */}
            <div className="space-y-5 mt-6">

              {/* 冒頭（赤文字） */}
              <div className="bg-red-50/60 rounded-xl border border-red-200/40 p-4">
                <p className="text-xs text-red-700 leading-relaxed">
                  本書面は、特定商取引法（以下「特商法」といいます。）第58条の8に基づき交付する書面です。重要な内容が記載されておりますので、内容を十分にお読みください。また、本件の個人情報については、個人情報保護法及び買いクルのプライバシーポリシーに従って取り扱います。
                </p>
              </div>

              {/* 個人情報保護方針 */}
              <div className="bg-white/40 rounded-xl border border-white/60 p-4">
                <h3 className="text-xs font-bold text-gray-900 mb-3">■個人情報保護方針</h3>
                <div className="text-xs text-gray-700 leading-relaxed space-y-3">
                  <p>収集する個人情報について、個人情報保護方針に即して必要な対策を講じて適切に管理致します。</p>
                  <div>
                    <p className="font-semibold mb-1">1. 取得する個人情報</p>
                    <p>当社は、後記「2. 個人情報の利用目的」に定める目的のため、本売買契約のご契約者様（以下「お客様」といいます。）に関して以下に定める個人情報を取得致します。</p>
                    <ul className="mt-1 space-y-0.5 pl-2">
                      <li>・お客様の氏名、住所、生年月日、連絡先、メールアドレス、ご職業、本人確認書類の写し</li>
                      <li>・本売買契約における品名、品目数、単価、金額、売買契約の締結日時</li>
                      <li>・お客様から当社へのお問合せ、ご連絡等に関する情報</li>
                      <li>・その他本売買契約の記載事項</li>
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold mb-1">2. 利用目的</p>
                    <p>当社は、取得した個人情報を以下の目的の範囲内で利用致します。なお、以下の目的に関連する目的についても含まれるものとします。</p>
                    <ul className="mt-1 space-y-0.5 pl-2">
                      <li>・商品の配送及び発送並びにアフターサービスに関するご連絡</li>
                      <li>・買取商品に関するご連絡</li>
                      <li>・新商品のご提案やサービスのご案内に関するご連絡</li>
                      <li>・法令に基づき開示することが必要である場合</li>
                    </ul>
                  </div>
                  <p>3. 当社では取得した個人情報を、上記「2. 利用目的」の範囲内において、株式会社RC または「買いクル」フランチャイズ加盟店に提供する場合がございます。</p>
                  <p>4. 当社は、事業運営上、お客様により良いサービスを提供するために業務の一部を外部に委託しています。その一環として、業務委託先に対し、上記「2. 利用目的」の達成に必要な範囲内において個人情報を提供することがあります。この場合、個人情報を適切に取り扱っていると認められる委託先を選定し、契約等において個人情報の適正管理・機密保持などによりお客様の個人情報の漏洩防止に必要な事項を取決め、適切な管理を実施させます。</p>
                </div>
              </div>

              {/* クーリング・オフについて（赤文字） */}
              <div className="bg-red-50/60 rounded-xl border border-red-200/40 p-4">
                <h3 className="text-xs font-bold text-red-700 mb-3">■クーリング・オフについて</h3>
                <div className="text-xs text-red-700 leading-relaxed space-y-3">
                  <p>1. お客様が、訪問買取で本売買契約をご契約された場合、本書面を受け取った日から8日を経過するまでの間は書面または電磁的方法により本売買契約のクーリング・オフ（契約の解除）ができます。ただし、当該売買契約の相手方の利益を損なうおそれがないと認められる物品または特商法の適用を受けることとされた場合に流通が著しく害されるおそれがあると認められる物品であって、政令で定める物品（自動車・家庭用電気機械器具（携行が容易なものを除く。）・家具・書籍・有価証券・レコード、CD、ゲームソフト等）は対象外になります。</p>
                  <p>2. クーリング・オフの効力は、書面または電磁的記録による通知を発信したとき（郵便消印日付など）から発生し、第三者に対しても対抗することができます。ただし、第三者がクーリング・オフにつき善意であり、かつ、過失がないときは、クーリング・オフの効力を当該第三者に対抗することはできません。</p>
                  <p>3. お客様がクーリング・オフをした場合で、お客様が本売買契約の目的物である物品を購入業者（購入店舗）に既に引き渡していた場合には、速やかに物品を返却致します。</p>
                  <p>4. お客様がクーリング・オフをした場合、契約書に「キャンセル料」や「違約金」について書かれていても、お客様が損害賠償及び違約金の支払を請求されることは一切ありません。</p>
                  <p>5. 訪問購入の場合、お客様が購入業者（購入店舗）から受け取った代金を返還する際にかかる費用は、購入業者（購入店舗）の負担となります。</p>
                  <p>6. お客様のクーリング・オフの行使を妨げるために購入業者が不実のことを告げ、そのためお客様が誤解し、または脅迫によりクーリング・オフを行わなかった場合には、当該購入業者（購入店舗）が交付したクーリング・オフ妨害の解消のための書面を受領した日から8日が経過するまでは、書面または電磁的記録によりクーリング・オフをすることができます。</p>
                  <p className="font-semibold mt-2">本書面受領日: {formatDate(contractDate)}　クーリング・オフ期限: {formatDate(coolingOffDate)}</p>
                </div>
              </div>

              {/* クーリング・オフの書き方 */}
              <div className="bg-white/40 rounded-xl border border-white/60 p-4">
                <h3 className="text-xs font-bold text-gray-900 mb-3">■クーリング・オフの書き方</h3>
                <div className="text-xs text-gray-700 leading-relaxed space-y-2">
                  <p>1. ハガキ等の書面または電子メール等の電磁的記録で行います。</p>
                  <p>2. 下記の項目を記載してください。</p>
                  <ul className="pl-4 space-y-0.5">
                    <li>(1) お客様（受取人）の住所及び氏名</li>
                    <li>(2) 契約（申込）日</li>
                    <li>(3) 購入業者名（購入店舗）及びその住所</li>
                    <li>(4) 担当者名</li>
                    <li>(5) 物品名</li>
                    <li>(6) 契約金額</li>
                    <li>(7) 契約を解除する旨</li>
                  </ul>
                  <p>3. ハガキ等の書面による方法の場合、そのコピーを作成いただくことを推奨致します。</p>
                  <p>4. ハガキ等の書面による方法の場合、郵便局の窓口で、簡易書留等の「出した日付」がわかる方法で購入業者（購入店舗宛）に提出いただくことが確実です。</p>
                  <p>5. ハガキ等の書面による方法の場合、コピーや簡易書留のお問合せ番号等を保存することを推奨致します（この2つがクーリング・オフをしたことの証拠になります）。また、電磁的記録による場合、当該電磁的記録を保存することを推奨致します。</p>
                </div>
              </div>

              {/* 物品の引渡拒絶についての規定（赤文字） */}
              <div className="bg-red-50/60 rounded-xl border border-red-200/40 p-4">
                <h3 className="text-xs font-bold text-red-700 mb-3">■物品の引渡拒絶についての規定</h3>
                <p className="text-xs text-red-700 leading-relaxed">
                  お客様が、訪問買取で本売買契約をご契約された場合で、後日物品の引き渡しを行うときには、上記「■クーリング・オフについて」のうち「1.」または「6.」に定めるいわゆるクーリング・オフ期間の間は、物品の引き渡しの拒絶が可能です。
                </p>
              </div>

              {/* 買取時の確認事項 */}
              <div className="bg-white/40 rounded-xl border border-white/60 p-4">
                <h3 className="text-xs font-bold text-gray-900 mb-3">■買取時の確認事項</h3>
                <div className="text-xs text-gray-700 leading-relaxed space-y-2">
                  <p>1. 申込時の電話案内にて特定された品種以外の不意打ち的な勧誘行為を受けておりません。</p>
                  <p>2. 今回の商談で、しつこい押し買い行為、虚偽言動、強制的な売買の勧誘といった迷惑を覚えるような勧誘を受けていません。</p>
                  <p>3. 搬出時、無償での作業支援で発生した物品や建物への破損、損害については一切の責任を負いかねることに同意します。</p>
                  <p>4. 特商法58条の17に規定する事由にあたる場合（お客様による来訪請求の場合、お客様がお住まいから退去する場合など）、クーリング・オフ適用外取引となりますので、一切の返品はできないことを認識しました。</p>
                  <p>5. 買取または引取をした物品が故障・破損している場合（当該物品の部品が足りていない場合を含む。）、買取時にお客様から事実と異なる虚偽の申告があった場合、または当該物品が贋作であることが判明した場合には、購入業者が物品を返品の上、お客様に買取代金をご返金いただくことを認識しました。</p>
                  <p>6. 反社会勢力ではないことの誓約<br />私は、暴力団、暴力団員、暴力団準構成員、暴力団関係企業、総会屋、社会運動標榜ゴロまたは特殊知能暴力団等、その他これに準ずる者（以下「反社会的勢力」といいます。）のいずれでもなく、また、反社会勢力が経営に実質的に関与している法人等に属する者ではないことを表明し、かつ将来にわたっても該当しないことを誓約します。私が、反社会勢力に該当すると認められるときは、何らの通知・催告をすることなしに、本件売買契約を解除されること及び私に損害が生じたとしても賠償請求できないことを了承します。</p>
                </div>
              </div>

              {/* 末尾 */}
              <p className="text-xs text-gray-500 text-center leading-relaxed">
                本書面は、買取申込書と一体として、売買契約書になるものです。大事に保管下さい。
              </p>
            </div>
          </div>
        </div>

        {/* 請求書（売買契約書とは別の独立した書類） */}
        {contract.workItems.length > 0 && (
          <div className="mt-6 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-sm p-6 sm:p-8">
            <div className="bg-gray-900 text-white px-6 py-4 text-center rounded-xl mb-5">
              <h2 className="text-lg font-bold tracking-wider">請求書</h2>
            </div>
            <div className="bg-white/40 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/30 border-b border-white/60">
                    <th className="text-left px-3 py-2 text-gray-600 font-medium">作業名</th>
                    <th className="text-right px-3 py-2 text-gray-600 font-medium">数量</th>
                    <th className="text-right px-3 py-2 text-gray-600 font-medium">単価</th>
                    <th className="text-right px-3 py-2 text-gray-600 font-medium">小計</th>
                  </tr>
                </thead>
                <tbody>
                  {contract.workItems.map((item) => (
                    <tr key={item.id} className="border-b border-white/40">
                      <td className="px-3 py-2 text-gray-900">{item.workName}</td>
                      <td className="px-3 py-2 text-gray-900 text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-gray-900 text-right">{formatCurrency(item.unitPrice)}円</td>
                      <td className="px-3 py-2 text-gray-900 text-right font-medium">{formatCurrency(item.unitPrice * item.quantity)}円</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-white/30 border-t border-white/60">
                    <td colSpan={3} className="px-3 py-2 text-right font-bold text-gray-700">請求金額合計</td>
                    <td className="px-3 py-2 text-right font-bold text-[#B91C1C]">{formatCurrency(workTotal)}円</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {contract.hasInvoicePdf && (
              <div className="text-center mt-5">
                <a
                  href={invoicePdfHref}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-800 rounded-2xl font-semibold text-sm shadow-sm hover:bg-gray-50 transition-all active:scale-[0.98]"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  請求書PDFをダウンロード
                </a>
              </div>
            )}
          </div>
        )}

        {/* PDFダウンロード（表示中の契約書をその場でPDF化） */}
        <div className="mt-6 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-sm p-6 text-center">
          <p className="text-sm text-gray-600 mb-4">この売買契約書をPDFで保存できます</p>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-800 rounded-2xl font-semibold text-sm shadow-sm hover:bg-gray-50 transition-all active:scale-[0.98] disabled:opacity-60"
          >
            {downloading ? (
              <>
                <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                作成中...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                売買契約書PDFをダウンロード
              </>
            )}
          </button>
          {pdfError && <p className="text-xs text-red-600 mt-3">{pdfError}</p>}
        </div>

        {/* マイページへの導線 */}
        <div className="mt-6 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-sm p-6 text-center">
          <p className="text-sm text-gray-600 mb-4">
            マイページでは、契約履歴の確認や各種設定が行えます
          </p>
          <a
            href="/mypage"
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-rose-500 text-white rounded-2xl font-semibold text-sm shadow-lg shadow-red-500/25 hover:shadow-xl transition-all active:scale-[0.98]"
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
      <div className="min-h-screen bg-gradient-to-b from-pink-50/50 via-white to-purple-50/50 flex items-center justify-center">
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
