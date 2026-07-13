'use client'

import { useEffect, useState, Suspense, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { buildInvoiceNotesHtml, buildTokushohoHtml } from '@/lib/legal-texts'

interface EstimateData {
  id: string
  user: { id: string; name: string; phone: string; address: string; idAddress: string | null; idName: string | null }
  store: { id: string; name: string; address: string; phone: string }
  estimate: { id: string; validUntil: string; staffName: string | null; purchaseAmount: number; billingAmount: number; createdAt: string }
  hasPdf?: boolean
  hasInvoicePdf?: boolean
  purchaseItems: { id: string; itemName: string | null; category: string | null; quantity: number; purchasePrice: number }[]
  workItems: { id: string; workName: string | null; unitPrice: number; quantity: number }[]
}

const yen = (n: number) => `¥${n.toLocaleString()}`
function fmtDate(d: string) {
  const dt = new Date(d)
  return `${dt.getFullYear()}年${dt.getMonth() + 1}月${dt.getDate()}日`
}

function EstimateViewContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const visitId = searchParams.get('id')

  const [data, setData] = useState<EstimateData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [downloading, setDownloading] = useState(false)
  const [pdfError, setPdfError] = useState('')

  // 表示中の見積書をその場でPDF化してダウンロード（保存済みPDFの有無に依存しない）
  const handleDownloadPdf = useCallback(async () => {
    const el = cardRef.current
    if (!el) return
    setDownloading(true)
    setPdfError('')
    try {
      const { elementToPdf } = await import('@/lib/pdf-export')
      const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      // 要素のブロック境界で改ページするため文字が途中で切れない
      await elementToPdf(el, { mode: 'save', filename: `見積書_${ymd}.pdf` })
    } catch (e) {
      console.error('PDF生成エラー:', e)
      setPdfError('PDFの生成に失敗しました。お手数ですが、時間をおいて再度お試しください。')
    } finally {
      setDownloading(false)
    }
  }, [])

  const fetchEstimate = useCallback(async (vId: string, uid?: string) => {
    try {
      const url = uid ? `/api/magic-link/estimate?visitId=${vId}&userId=${uid}` : `/api/magic-link/estimate?visitId=${vId}`
      const res = await fetch(url)
      const d = await res.json()
      if (!res.ok) setError(d.error || '見積データの取得に失敗しました')
      else setData(d)
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? sessionStorage.getItem('magicAuth') : null
    if (stored) {
      try {
        const auth = JSON.parse(stored)
        setUserId(auth.userId)
        const id = visitId || auth.contractId
        if (!id) { setError('見積IDが見つかりません'); setLoading(false); return }
        fetchEstimate(id, auth.userId)
        return
      } catch { /* fall through */ }
    }
    if (visitId) { fetchEstimate(visitId); return }
    router.replace('/login')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visitId])

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-rose-50/50 via-white to-orange-50/50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-10 h-10 border-4 border-gray-200 border-t-[#B91C1C] rounded-full animate-spin mb-4" />
          <p className="text-gray-600 text-sm">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-rose-50/50 via-white to-orange-50/50 flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-lg font-bold text-gray-800 mb-2">見積書を表示できません</h1>
          <p className="text-gray-500 text-sm mb-6">{error || 'データが見つかりません'}</p>
          <a href="/mypage" className="inline-flex px-6 py-3 bg-gradient-to-r from-red-600 to-rose-500 text-white rounded-2xl font-semibold text-sm">マイページへ</a>
        </div>
      </div>
    )
  }

  const purchaseTotal = data.purchaseItems.reduce((s, i) => s + i.purchasePrice * i.quantity, 0)
  const workTotal = data.workItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50/50 via-white to-orange-50/50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div ref={cardRef} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          {/* ヘッダー */}
          <div className="flex items-baseline justify-between mb-3 pb-2 border-b-2 border-[#B91C1C]">
            <h1 className="text-lg font-bold text-gray-900">お見積書</h1>
            <span className="text-[11px] text-gray-400">発行日: {fmtDate(data.estimate.createdAt)}</span>
          </div>

          {/* 店舗情報 */}
          <div className="space-y-1 p-3 rounded-lg bg-gray-50 text-xs text-gray-600 mb-4">
            <div className="text-[11px] font-bold text-gray-800 mb-1.5">見積発行店舗</div>
            <div><span className="font-medium">店舗名:</span> {data.store.name}</div>
            {data.store.address && <div><span className="font-medium">住所:</span> {data.store.address}</div>}
            {data.store.phone && <div><span className="font-medium">電話:</span> {data.store.phone}</div>}
            {data.estimate.staffName && <div><span className="font-medium">担当者:</span> {data.estimate.staffName}</div>}
          </div>

          <div className="text-xs text-gray-600 mb-4">
            <span className="font-medium">見積有効期限:</span> {fmtDate(data.estimate.validUntil)}
          </div>

          {/* 買取品目 */}
          {data.purchaseItems.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] font-bold text-gray-800 mb-1.5">買取品目</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="py-1.5 text-left font-medium">品名</th>
                    <th className="py-1.5 text-right font-medium w-12">数量</th>
                    <th className="py-1.5 text-right font-medium w-20">単価</th>
                    <th className="py-1.5 text-right font-medium w-24">小計</th>
                  </tr>
                </thead>
                <tbody>
                  {data.purchaseItems.map(i => (
                    <tr key={i.id} className="border-b border-gray-100">
                      <td className="py-1.5 text-gray-900">{i.itemName || '（品名未設定）'}{i.category && <span className="text-[10px] text-gray-400 ml-1">/ {i.category}</span>}</td>
                      <td className="py-1.5 text-right text-gray-600">{i.quantity}</td>
                      <td className="py-1.5 text-right text-gray-600">{yen(i.purchasePrice)}</td>
                      <td className="py-1.5 text-right font-medium text-gray-900">{yen(i.purchasePrice * i.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 請求項目 */}
          {data.workItems.length > 0 && (
            <div className="mb-4">
              <div className="text-[11px] font-bold text-gray-800 mb-1.5">請求項目（作業・サービス）</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="py-1.5 text-left font-medium">項目</th>
                    <th className="py-1.5 text-right font-medium w-12">数量</th>
                    <th className="py-1.5 text-right font-medium w-20">単価</th>
                    <th className="py-1.5 text-right font-medium w-24">小計</th>
                  </tr>
                </thead>
                <tbody>
                  {data.workItems.map(i => (
                    <tr key={i.id} className="border-b border-gray-100">
                      <td className="py-1.5 text-gray-900">{i.workName || '（項目未設定）'}</td>
                      <td className="py-1.5 text-right text-gray-600">{i.quantity}</td>
                      <td className="py-1.5 text-right text-gray-600">{yen(i.unitPrice)}</td>
                      <td className="py-1.5 text-right font-medium text-gray-900">{yen(i.unitPrice * i.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 合計 */}
          <table className="w-full text-sm border-t-2 border-gray-200">
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-3 text-gray-600">買取金額 合計</td>
                <td className="py-3 text-right font-bold text-lg text-[#B91C1C]">{yen(purchaseTotal)}</td>
              </tr>
              <tr>
                <td className="py-3 text-gray-600">請求金額 合計</td>
                <td className="py-3 text-right font-bold text-lg text-gray-900">{yen(workTotal)}</td>
              </tr>
            </tbody>
          </table>

          <p className="text-[10px] text-gray-400 mt-4">※ 本見積書は概算であり、現品確認後に金額が変動する場合がございます。</p>

          {/* 注意事項 */}
          <div className="mt-4" dangerouslySetInnerHTML={{ __html: buildInvoiceNotesHtml() }} />
          {/* 特定商取引法に基づく書面 */}
          <div className="mt-4" dangerouslySetInnerHTML={{ __html: buildTokushohoHtml() }} />
        </div>

        {/* PDFダウンロード（表示中の見積書をその場でPDF化） */}
        <div className="mt-6 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-sm p-6 text-center">
          <p className="text-sm text-gray-600 mb-4">この見積書をPDFで保存できます</p>
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
                見積書PDFをダウンロード
              </>
            )}
          </button>
          {pdfError && <p className="text-xs text-red-600 mt-3">{pdfError}</p>}
        </div>

        {/* マイページ導線 */}
        <div className="mt-6 bg-white/70 backdrop-blur-xl rounded-2xl border border-white/50 shadow-sm p-6 text-center">
          <p className="text-sm text-gray-600 mb-4">マイページでは、各種履歴の確認や設定が行えます</p>
          <a href="/mypage" className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-red-600 to-rose-500 text-white rounded-2xl font-semibold text-sm shadow-lg shadow-red-500/25 hover:shadow-xl transition-all active:scale-[0.98]">
            マイページへ
          </a>
        </div>
      </div>
    </div>
  )
}

export default function EstimateViewPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-rose-50/50 via-white to-orange-50/50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-10 h-10 border-4 border-gray-200 border-t-[#B91C1C] rounded-full animate-spin mb-4" />
          <p className="text-gray-600 text-sm">読み込み中...</p>
        </div>
      </div>
    }>
      <EstimateViewContent />
    </Suspense>
  )
}
