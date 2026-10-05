'use client'

import { forwardRef } from 'react'
import { formatBirthDate } from '@/lib/kobutsu-ledger'
import { storeContractName } from '@/lib/operator-utils'
import { formatYen } from '@/lib/currency'

/**
 * 宅配買取の売買契約書（署名なし・店舗が発行）。
 *
 * 画面に表示したこの要素をそのまま PDF 化して保存・送付する（elementToPdf）。
 * PDF は紙として読まれるので、ポータルのテーマ色（ダーク等）に左右されないよう
 * 背景・文字色はグレー系の固定色で書く。
 *
 * 訪問買取の売買契約書（agreement/final）との違い:
 *   - お客様の署名欄がない（非対面のため）
 *   - 特定商取引法の訪問購入に当たらないため、クーリング・オフの書面を載せない
 */
export type DeliveryContractDocumentProps = {
  contractNo: string
  /** 契約日（未発行のプレビュー中は今日） */
  contractDate: Date
  shipmentNumber: string
  customer: {
    name: string
    address: string | null
    phone: string | null
    birthDate: string | null
    occupation: string | null
    idDocumentType: string | null
  }
  store: {
    name: string
    address: string | null
    phone: string | null
    antiquePermitNumber: string | null
  }
  /** 担当者（発行者）名 */
  staffName?: string | null
  items: { id: string; itemName: string; category: string; quantity: number; purchasePrice: number }[]
  remarks?: string | null
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric' })
}

const DeliveryContractDocument = forwardRef<HTMLDivElement, DeliveryContractDocumentProps>(function DeliveryContractDocument(
  { contractNo, contractDate, shipmentNumber, customer, store, staffName, items, remarks },
  ref,
) {
  const total = items.reduce((s, i) => s + i.purchasePrice, 0)
  const remarksText = (remarks ?? '').trim()

  return (
    <div ref={ref} className="space-y-4 bg-white p-4 sm:p-6 rounded-xl text-gray-900">
      {/* ── 売買契約書 本体 ── */}
      <section>
        <div className="flex items-baseline justify-between mb-3 pb-2 border-b-2 border-gray-800">
          <h2 className="text-base font-bold">売買契約書（宅配買取）</h2>
          <span className="text-[10px] text-gray-500">契約番号: {contractNo}</span>
        </div>

        <div className="text-xs text-gray-600 mb-4 pb-4 border-b border-gray-200">
          <div className="flex flex-wrap gap-x-6 gap-y-1 mb-3">
            <div><span className="font-medium">契約日:</span> {fmtDate(contractDate)}</div>
            <div><span className="font-medium">送付番号:</span> {shipmentNumber}</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 p-3 rounded-lg bg-gray-50">
              <div className="text-[11px] font-bold text-gray-900 mb-1.5">お客様情報（売主）</div>
              <div><span className="font-medium">氏名:</span> {customer.name}</div>
              <div><span className="font-medium">住所:</span> {customer.address || '—'}</div>
              <div><span className="font-medium">電話:</span> {customer.phone || '—'}</div>
              <div><span className="font-medium">生年月日:</span> {formatBirthDate(customer.birthDate) || '—'}</div>
              <div><span className="font-medium">ご職業:</span> {customer.occupation || '—'}</div>
              {customer.idDocumentType && (
                <div className="text-[10px] text-green-700 mt-1">本人確認: {customer.idDocumentType}</div>
              )}
            </div>
            <div className="space-y-1 p-3 rounded-lg bg-gray-50">
              <div className="text-[11px] font-bold text-gray-900 mb-1.5">買取業者情報（買主）</div>
              <div><span className="font-medium">店舗名:</span> {storeContractName(store.name)}</div>
              {store.address && <div><span className="font-medium">住所:</span> {store.address}</div>}
              {store.phone && <div><span className="font-medium">電話:</span> {store.phone}</div>}
              <div><span className="font-medium">古物営業許可番号:</span> {store.antiquePermitNumber || '—'}</div>
              {staffName && <div><span className="font-medium">担当者:</span> {staffName}</div>}
            </div>
          </div>
        </div>

        <h3 className="text-xs font-semibold mb-2">買取品目</h3>
        {items.length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="text-left py-1.5 font-medium">品名</th>
                <th className="text-left py-1.5 font-medium">カテゴリー</th>
                <th className="text-right py-1.5 font-medium">数量</th>
                <th className="text-right py-1.5 font-medium">買取金額</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="border-b border-gray-100">
                  <td className="py-1.5">{item.itemName}</td>
                  <td className="py-1.5 text-gray-500">{item.category}</td>
                  <td className="py-1.5 text-right">{item.quantity}</td>
                  <td className="py-1.5 text-right font-medium">{formatYen(item.purchasePrice)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="py-2 text-right font-bold">買取金額合計</td>
                <td className="py-2 text-right font-bold text-lg text-red-800">{formatYen(total)}</td>
              </tr>
            </tfoot>
          </table>
        ) : (
          <p className="text-xs text-gray-500">買取品目は登録されていません</p>
        )}

        {remarksText && (
          <div className="mt-3 p-3 rounded-lg bg-gray-50 text-xs">
            <div className="text-[11px] font-bold mb-1">備考</div>
            <div className="whitespace-pre-wrap leading-relaxed">{remarksText}</div>
          </div>
        )}
      </section>

      {/* ── 取引条件 ── */}
      <section className="pt-2">
        <h2 className="text-sm font-bold mb-3">取引条件</h2>
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-gray-50">
            <p className="text-xs font-bold mb-2">■宅配買取について</p>
            <div className="text-xs text-gray-600 space-y-1.5 leading-relaxed">
              <p>1. 本書は、お客様が宅配によりお送りくださった物品について、当社が査定のうえ、本書記載の買取金額で買い受けたことを証する書面です。</p>
              <p>2. 本取引は宅配による買取のため、特定商取引法に定める訪問購入には該当せず、クーリング・オフの対象外となります。</p>
              <p>3. 当社は古物営業法に基づき、本人確認書類によりお客様の本人確認を行っております。</p>
              <p>4. 本取引は非対面で行うため、お客様の署名は省略しております。</p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-gray-50">
            <p className="text-xs font-bold mb-2">■個人情報保護方針</p>
            <div className="text-xs text-gray-600 space-y-2 leading-relaxed">
              <p>収集する個人情報について、個人情報保護方針に即して必要な対策を講じて適切に管理致します。</p>
              <div>
                <p className="font-semibold text-gray-900">1. 取得する個人情報</p>
                <p>当社は、後記「2. 利用目的」に定める目的のため、本売買契約のご契約者様（以下「お客様」といいます。）に関して以下に定める個人情報を取得致します。</p>
                <ul className="mt-1 space-y-0.5 pl-2">
                  <li>・お客様の氏名、住所、生年月日、連絡先、メールアドレス、ご職業、本人確認書類の写し</li>
                  <li>・本売買契約における品名、品目数、単価、金額、売買契約の締結日時</li>
                  <li>・お客様から当社へのお問合せ、ご連絡等に関する情報</li>
                  <li>・その他本売買契約の記載事項</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-900">2. 利用目的</p>
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

          <div className="p-3 rounded-lg bg-gray-50">
            <p className="text-xs font-bold mb-2">■買取時の確認事項</p>
            <div className="text-xs text-gray-600 space-y-1.5 leading-relaxed">
              <p>1. 買取または引取をした物品が故障・破損している場合（当該物品の部品が足りていない場合を含む。）、お客様から事実と異なる虚偽の申告があった場合、または当該物品が贋作であることが判明した場合には、購入業者が物品を返品の上、お客様に買取代金をご返金いただきます。</p>
              <p>2. 反社会勢力ではないことの誓約<br />お客様は、暴力団、暴力団員、暴力団準構成員、暴力団関係企業、総会屋、社会運動標榜ゴロまたは特殊知能暴力団等、その他これに準ずる者（以下「反社会的勢力」といいます。）のいずれでもなく、また、反社会勢力が経営に実質的に関与している法人等に属する者ではないことを表明し、かつ将来にわたっても該当しないことを誓約するものとします。お客様が反社会勢力に該当すると認められるときは、何らの通知・催告をすることなしに本件売買契約を解除されること及びお客様に損害が生じたとしても賠償請求できないことを了承するものとします。</p>
            </div>
          </div>

          <p className="text-xs text-gray-500 text-center">本書面は大切に保管下さい。</p>
        </div>
      </section>
    </div>
  )
})

export default DeliveryContractDocument
