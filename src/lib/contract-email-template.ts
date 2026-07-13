/**
 * 契約書送付メール本文ビルダー
 * 売買契約書・請求書・特商法書面・同意の記録 を1通に全て収めた HTML / プレーンテキスト
 * を構築する。マイページリンクは別途呼び出し側で扱う（このモジュールはコンテンツ本文のみ）。
 */

import { formalName, storeContractName } from '@/lib/operator-utils'

export type ContractEmailItem = {
  itemName: string
  category?: string | null
  quantity: number
  price: number
}

export type ContractEmailWork = {
  workName: string
  quantity: number
  unitPrice: number
}

export type ContractEmailOperator = {
  entityType: string | null
  corporatePrefix: string | null
  prefixPosition: string | null
  name: string
  address: string | null
  representativeName?: string
} | null

export type ContractEmailParams = {
  customerName: string
  customerAddress: string
  customerPhone: string
  customerIdType?: string | null
  storeName: string
  storeAddress?: string | null
  storePhone?: string | null
  operator: ContractEmailOperator
  staffName?: string
  visitDate: Date
  contractDate: Date
  contractNo: string
  invoiceNo: string
  purchaseItems: ContractEmailItem[]
  workItems: ContractEmailWork[]
  agreedAt: Date
  /** 再訪問日（後日引取の場合に記載） */
  revisitDate?: Date | null
  revisitStart?: string | null
  revisitEnd?: string | null
  revisitNote?: string | null
}

const fmtYen = (n: number) => `¥${n.toLocaleString()}`

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric' })
}

function fmtDateTime(d: Date): string {
  return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
}

/** 売買契約書 + 請求書 + 特商法書面 + 同意の記録 を1つの HTML 文字列にする */
export function buildContractBodyHtml(p: ContractEmailParams): string {
  const purchaseTotal = p.purchaseItems.reduce((s, i) => s + i.price * i.quantity, 0)
  const workTotal = p.workItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  const coolingOffEnd = addDays(p.contractDate, 7)
  const sellerName = p.operator ? formalName(p.operator) : p.storeName
  const sellerAddress = p.operator?.address || p.storeAddress || ''

  const cellTh = 'padding:8px 10px;font-size:11px;font-weight:600;color:#6b7280;border-bottom:1px solid #e5e7eb;text-align:left;'
  const cellThR = cellTh + 'text-align:right;'
  const cellTd = 'padding:8px 10px;font-size:12px;color:#1f2937;border-bottom:1px solid #f3f4f6;'
  const cellTdR = cellTd + 'text-align:right;'
  const cellTf = 'padding:10px;font-size:12px;font-weight:700;color:#111827;'
  const cellTfR = cellTf + 'text-align:right;'

  const sectionTitle = (title: string, sub?: string) => `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom:2px solid #991b1b;margin:24px 0 12px;">
      <tr>
        <td style="padding-bottom:6px;"><h2 style="margin:0;font-size:16px;font-weight:700;color:#111827;">${escape(title)}</h2></td>
        ${sub ? `<td style="padding-bottom:6px;text-align:right;font-size:10px;color:#6b7280;">${escape(sub)}</td>` : ''}
      </tr>
    </table>`

  const subTitle = (title: string) => `<h3 style="margin:16px 0 8px;font-size:13px;font-weight:600;color:#374151;">${escape(title)}</h3>`

  // 売買契約書
  const revisitDt = p.revisitDate ? (typeof p.revisitDate === 'string' ? new Date(p.revisitDate) : p.revisitDate) : null
  const revisitDtStr = revisitDt && !isNaN(revisitDt.getTime()) ? fmtDate(revisitDt) : ''
  const revisitTimeStr = [p.revisitStart, p.revisitEnd].filter(Boolean).join('〜')
  const saleContract = `
    ${sectionTitle('売買契約書', `契約番号: ${p.contractNo}`)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;">
      <tr>
        <td style="font-size:11px;color:#6b7280;padding-bottom:8px;">
          <strong style="color:#111827;">契約日:</strong> ${escape(fmtDate(p.contractDate))}
          &nbsp;<strong style="color:#111827;">訪問日:</strong> ${escape(fmtDate(p.visitDate))}
          ${revisitDtStr ? `&nbsp;<strong style="color:#111827;">再訪問日（引取）:</strong> ${escape(revisitDtStr)}${revisitTimeStr ? `（${escape(revisitTimeStr)}）` : ''}` : ''}
          ${p.revisitNote ? `<br><span style="font-size:10px;">再訪問メモ: ${escape(p.revisitNote)}</span>` : ''}
        </td>
      </tr>
    </table>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
      <tr>
        <td width="50%" valign="top" style="padding-right:6px;">
          <div style="background:#f9fafb;padding:10px 12px;border-radius:8px;font-size:12px;line-height:1.7;color:#1f2937;">
            <div style="font-weight:700;font-size:11px;color:#111827;margin-bottom:4px;">お客様情報（売主）</div>
            <div><strong>氏名:</strong> ${escape(p.customerName)}</div>
            <div><strong>住所:</strong> ${escape(p.customerAddress)}</div>
            <div><strong>電話:</strong> ${escape(p.customerPhone)}</div>
            ${p.customerIdType ? `<div style="margin-top:4px;color:#047857;font-size:10px;">本人確認: ${escape(p.customerIdType)}</div>` : ''}
          </div>
        </td>
        <td width="50%" valign="top" style="padding-left:6px;">
          <div style="background:#f9fafb;padding:10px 12px;border-radius:8px;font-size:12px;line-height:1.7;color:#1f2937;">
            <div style="font-weight:700;font-size:11px;color:#111827;margin-bottom:4px;">買取業者情報（買主）</div>
            <div><strong>店舗名:</strong> ${escape(storeContractName(p.storeName))}</div>
            ${p.storeAddress ? `<div><strong>住所:</strong> ${escape(p.storeAddress)}</div>` : ''}
            ${p.storePhone ? `<div><strong>電話:</strong> ${escape(p.storePhone)}</div>` : ''}
            ${p.staffName ? `<div><strong>担当者:</strong> ${escape(p.staffName)}</div>` : ''}
          </div>
        </td>
      </tr>
    </table>
    ${subTitle('買取品目')}
    ${p.purchaseItems.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="${cellTh}">品名</th>
          <th style="${cellTh}">カテゴリー</th>
          <th style="${cellThR}">数量</th>
          <th style="${cellThR}">単価</th>
          <th style="${cellThR}">小計</th>
        </tr>
      </thead>
      <tbody>
        ${p.purchaseItems.map(i => `
          <tr>
            <td style="${cellTd}">${escape(i.itemName)}</td>
            <td style="${cellTd}color:#6b7280;">${escape(i.category || '')}</td>
            <td style="${cellTdR}">${i.quantity}</td>
            <td style="${cellTdR}">${fmtYen(i.price)}</td>
            <td style="${cellTdR}font-weight:600;">${fmtYen(i.price * i.quantity)}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr style="background:#fef2f2;">
          <td colspan="4" style="${cellTfR}">買取金額合計</td>
          <td style="${cellTfR}color:#991b1b;font-size:14px;">${fmtYen(purchaseTotal)}</td>
        </tr>
      </tfoot>
    </table>
    ` : '<p style="font-size:12px;color:#6b7280;">買取品目は登録されていません</p>'}`

  // 請求書
  const invoice = `
    ${sectionTitle('請求書', `請求番号: ${p.invoiceNo}`)}
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:12px;font-size:12px;color:#1f2937;line-height:1.7;">
      <tr><td><strong style="color:#111827;">請求日:</strong> ${escape(fmtDate(p.contractDate))}</td></tr>
      <tr><td><strong style="color:#111827;">請求宛先:</strong> ${escape(p.customerName)} 様</td></tr>
      <tr><td><strong style="color:#111827;">請求元:</strong> ${escape(sellerName)}</td></tr>
      ${sellerAddress ? `<tr><td><strong style="color:#111827;">所在地:</strong> ${escape(sellerAddress)}</td></tr>` : ''}
    </table>
    ${subTitle('作業項目')}
    ${p.workItems.length > 0 ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:8px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="${cellTh}">作業名</th>
          <th style="${cellThR}">数量</th>
          <th style="${cellThR}">単価</th>
          <th style="${cellThR}">小計</th>
        </tr>
      </thead>
      <tbody>
        ${p.workItems.map(w => `
          <tr>
            <td style="${cellTd}">${escape(w.workName)}</td>
            <td style="${cellTdR}">${w.quantity}</td>
            <td style="${cellTdR}">${fmtYen(w.unitPrice)}</td>
            <td style="${cellTdR}font-weight:600;">${fmtYen(w.unitPrice * w.quantity)}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr style="background:#f9fafb;">
          <td colspan="3" style="${cellTfR}">請求金額合計</td>
          <td style="${cellTfR}font-size:14px;">${fmtYen(workTotal)}</td>
        </tr>
      </tfoot>
    </table>
    ` : '<p style="font-size:12px;color:#6b7280;">作業項目は登録されていません</p>'}
    <div style="margin-top:14px;padding-top:10px;border-top:1px solid #e5e7eb;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#111827;">注意事項</p>
      <ol style="margin:0;padding-left:18px;font-size:11px;color:#4b5563;line-height:1.7;">
        <li style="margin-bottom:6px;">お客様は、本書記載の家財道具、家具、その他動産類（以下「対象物」といいます。）について、搬出、片付け、運搬その他これらに付随する作業（以下「本作業」といいます。）を当社へ依頼します。本作業の内容および金額は本書記載の見積内容によります。見積後に判明した事情により追加作業および追加費用が必要となる場合は、本作業実施前にあらかじめにお客様にその作業内容および金額についてご説明し、ご了承を得たうえで、追加作業を実施し、その追加費用をお支払いいただくものとします。</li>
        <li style="margin-bottom:6px;">お客様は、対象物に第三者の所有物、リース品、盗品、遺失物等が含まれていないことを表明し、保証します。</li>
        <li style="margin-bottom:6px;">お客様都合による本作業の中止、延期、日程変更または内容変更（以下「キャンセル等」といいます。）の場合、作業日7日前から作業日前日までのキャンセル等は見積金額の10％、作業当日または作業員到着後のキャンセル等は見積金額の25％をキャンセル料としてお客様にお支払いいただきます。</li>
        <li style="margin-bottom:6px;">お客様に損害が生じた場合の当社の賠償範囲は、現実に発生した直接かつ通常の損害に限り、賠償額は本書記載の作業代金額を上限とします。ただし、当社に故意又は重大な過失がある場合は、この限りではありません。</li>
        <li>本作業に起因する一切の紛争については、弊社本店所在地を管轄する裁判所とします。</li>
      </ol>
    </div>`

  // 特商法書面
  const legal = `
    ${sectionTitle('特定商取引法に基づく書面')}
    <div style="font-size:11px;color:#374151;line-height:1.8;">
      <div style="background:#fef2f2;padding:10px 12px;border-radius:6px;margin-bottom:10px;color:#7f1d1d;">
        本書面は、特定商取引法（以下「特商法」といいます。）第58条の8に基づき交付する書面です。重要な内容が記載されておりますので、内容を十分にお読みください。また、本件の個人情報については、個人情報保護法及び買いクルのプライバシーポリシーに従って取り扱います。
      </div>

      <div style="background:#f9fafb;padding:10px 12px;border-radius:6px;margin-bottom:10px;">
        <p style="margin:0 0 6px;font-weight:700;color:#111827;">■個人情報保護方針</p>
        <p style="margin:0 0 6px;">収集する個人情報について、個人情報保護方針に即して必要な対策を講じて適切に管理致します。</p>
        <p style="margin:6px 0 4px;font-weight:600;">1. 取得する個人情報</p>
        <p style="margin:0;">当社は、後記「2. 個人情報の利用目的」に定める目的のため、本売買契約のご契約者様（以下「お客様」といいます。）に関して以下に定める個人情報を取得致します。</p>
        <ul style="margin:4px 0 6px 16px;padding:0;">
          <li>お客様の氏名、住所、生年月日、連絡先、メールアドレス、ご職業、本人確認書類の写し</li>
          <li>本売買契約における品名、品目数、単価、金額、売買契約の締結日時</li>
          <li>お客様から当社へのお問合せ、ご連絡等に関する情報</li>
          <li>その他本売買契約の記載事項</li>
        </ul>
        <p style="margin:6px 0 4px;font-weight:600;">2. 利用目的</p>
        <p style="margin:0;">当社は、取得した個人情報を以下の目的の範囲内で利用致します。</p>
        <ul style="margin:4px 0 6px 16px;padding:0;">
          <li>商品の配送及び発送並びにアフターサービスに関するご連絡</li>
          <li>買取商品に関するご連絡</li>
          <li>新商品のご提案やサービスのご案内に関するご連絡</li>
          <li>法令に基づき開示することが必要である場合</li>
        </ul>
        <p style="margin:6px 0 0;">3. 当社では取得した個人情報を、上記「2. 利用目的」の範囲内において、株式会社RC または「買いクル」フランチャイズ加盟店に提供する場合がございます。</p>
        <p style="margin:6px 0 0;">4. 当社は、事業運営上、お客様により良いサービスを提供するために業務の一部を外部に委託しています。その一環として、業務委託先に対し、上記「2. 利用目的」の達成に必要な範囲内において個人情報を提供することがあります。この場合、個人情報を適切に取り扱っていると認められる委託先を選定し、契約等において個人情報の適正管理・機密保持などによりお客様の個人情報の漏洩防止に必要な事項を取決め、適切な管理を実施させます。</p>
      </div>

      <div style="background:#fef2f2;padding:10px 12px;border-radius:6px;margin-bottom:10px;color:#7f1d1d;">
        <p style="margin:0 0 6px;font-weight:700;">■クーリング・オフについて</p>
        <p style="margin:0 0 4px;">1. お客様が、訪問買取で本売買契約をご契約された場合、本書面を受け取った日から8日を経過するまでの間は書面または電磁的方法により本売買契約のクーリング・オフ（契約の解除）ができます。ただし、当該売買契約の相手方の利益を損なうおそれがないと認められる物品または特商法の適用を受けることとされた場合に流通が著しく害されるおそれがあると認められる物品であって、政令で定める物品（自動車・家庭用電気機械器具（携行が容易なものを除く。）・家具・書籍・有価証券・レコード、CD、ゲームソフト等）は対象外になります。</p>
        <p style="margin:4px 0;">2. クーリング・オフの効力は、書面または電磁的記録による通知を発信したとき（郵便消印日付など）から発生し、第三者に対しても対抗することができます。ただし、第三者がクーリング・オフにつき善意であり、かつ、過失がないときは、クーリング・オフの効力を当該第三者に対抗することはできません。</p>
        <p style="margin:4px 0;">3. お客様がクーリング・オフをした場合で、お客様が本売買契約の目的物である物品を購入業者（購入店舗）に既に引き渡していた場合には、速やかに物品を返却致します。</p>
        <p style="margin:4px 0;">4. お客様がクーリング・オフをした場合、契約書に「キャンセル料」や「違約金」について書かれていても、お客様が損害賠償及び違約金の支払を請求されることは一切ありません。</p>
        <p style="margin:4px 0;">5. 訪問購入の場合、お客様が購入業者（購入店舗）から受け取った代金を返還する際にかかる費用は、購入業者（購入店舗）の負担となります。</p>
        <p style="margin:4px 0;">6. お客様のクーリング・オフの行使を妨げるために購入業者が不実のことを告げ、そのためお客様が誤解し、または脅迫によりクーリング・オフを行わなかった場合には、当該購入業者（購入店舗）が交付したクーリング・オフ妨害の解消のための書面を受領した日から8日が経過するまでは、書面または電磁的記録によりクーリング・オフをすることができます。</p>
        <p style="margin:6px 0 0;font-weight:700;">本書面受領日（${escape(fmtDate(p.contractDate))}）からクーリング・オフ期限: ${escape(fmtDate(coolingOffEnd))}</p>
      </div>

      <div style="background:#f9fafb;padding:10px 12px;border-radius:6px;margin-bottom:10px;">
        <p style="margin:0 0 6px;font-weight:700;color:#111827;">■クーリング・オフの書き方</p>
        <p style="margin:0;">1. ハガキ等の書面または電子メール等の電磁的記録で行います。</p>
        <p style="margin:4px 0 0;">2. 下記の項目を記載してください。</p>
        <ul style="margin:2px 0 4px 16px;padding:0;">
          <li>(1) お客様（受取人）の住所及び氏名</li>
          <li>(2) 契約（申込）日</li>
          <li>(3) 購入業者名（購入店舗）及びその住所</li>
          <li>(4) 担当者名</li>
          <li>(5) 物品名</li>
          <li>(6) 契約金額</li>
          <li>(7) 契約を解除する旨</li>
        </ul>
        <p style="margin:4px 0 0;">3. ハガキ等の書面による方法の場合、そのコピーを作成いただくことを推奨致します。</p>
        <p style="margin:4px 0 0;">4. ハガキ等の書面による方法の場合、郵便局の窓口で、簡易書留等の「出した日付」がわかる方法で購入業者（購入店舗宛）に提出いただくことが確実です。</p>
        <p style="margin:4px 0 0;">5. ハガキ等の書面による方法の場合、コピーや簡易書留のお問合せ番号等を保存することを推奨致します（この2つがクーリング・オフをしたことの証拠になります）。また、電磁的記録による場合、当該電磁的記録を保存することを推奨致します。</p>
      </div>

      <div style="background:#fef2f2;padding:10px 12px;border-radius:6px;margin-bottom:10px;color:#7f1d1d;">
        <p style="margin:0 0 6px;font-weight:700;">■物品の引渡拒絶についての規定</p>
        <p style="margin:0;">お客様が、訪問買取で本売買契約をご契約された場合で、後日物品の引き渡しを行うときには、上記「■クーリング・オフについて」のうち「1.」または「6.」に定めるいわゆるクーリング・オフ期間の間は、物品の引き渡しの拒絶が可能です。</p>
      </div>

      <div style="background:#f9fafb;padding:10px 12px;border-radius:6px;margin-bottom:10px;">
        <p style="margin:0 0 6px;font-weight:700;color:#111827;">■買取時の確認事項</p>
        <p style="margin:0;">1. 申込時の電話案内にて特定された品種以外の不意打ち的な勧誘行為を受けておりません。</p>
        <p style="margin:4px 0 0;">2. 今回の商談で、しつこい押し買い行為、虚偽言動、強制的な売買の勧誘といった迷惑を覚えるような勧誘を受けていません。</p>
        <p style="margin:4px 0 0;">3. 搬出時、無償での作業支援で発生した物品や建物への破損、損害については一切の責任を負いかねることに同意します。</p>
        <p style="margin:4px 0 0;">4. 特商法58条の17に規定する事由にあたる場合（お客様による来訪請求の場合、お客様がお住まいから退去する場合など）、クーリング・オフ適用外取引となりますので、一切の返品はできないことを認識しました。</p>
        <p style="margin:4px 0 0;">5. 買取または引取をした物品が故障・破損している場合（当該物品の部品が足りていない場合を含む。）、買取時にお客様から事実と異なる虚偽の申告があった場合、または当該物品が贋作であることが判明した場合には、購入業者が物品を返品の上、お客様に買取代金をご返金いただくことを認識しました。</p>
        <p style="margin:4px 0 0;">6. 反社会勢力ではないことの誓約: 私は、暴力団、暴力団員、暴力団準構成員、暴力団関係企業、総会屋、社会運動標榜ゴロまたは特殊知能暴力団等、その他これに準ずる者（以下「反社会的勢力」といいます。）のいずれでもなく、また、反社会勢力が経営に実質的に関与している法人等に属する者ではないことを表明し、かつ将来にわたっても該当しないことを誓約します。私が、反社会勢力に該当すると認められるときは、何らの通知・催告をすることなしに、本件売買契約を解除されること及び私に損害が生じたとしても賠償請求できないことを了承します。</p>
      </div>

      <p style="margin:8px 0 0;text-align:center;font-size:11px;color:#6b7280;">本書面は、買取申込書と一体として、売買契約書になるものです。大事に保管下さい。</p>
    </div>`

  // 売買契約への同意の記録
  const saleConsent = `
    ${sectionTitle('売買契約への同意')}
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;">
      <tr>
        <td style="padding:14px 16px;font-size:12px;color:#14532d;line-height:1.7;">
          <p style="margin:0 0 6px;font-weight:700;color:#166534;">✓ 売買契約内容に同意済み</p>
          <p style="margin:0;">${escape(p.customerName)} 様は、上記の売買契約および特定商取引法に基づく書面の内容を理解し、売買契約に同意・署名されました。</p>
          <p style="margin:6px 0 0;font-size:11px;color:#15803d;">同意日時: ${escape(fmtDateTime(p.agreedAt))}</p>
        </td>
      </tr>
    </table>`

  // 請求書への同意の記録
  const invoiceConsent = `
    ${sectionTitle('請求書への同意')}
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;">
      <tr>
        <td style="padding:14px 16px;font-size:12px;color:#14532d;line-height:1.7;">
          <p style="margin:0 0 6px;font-weight:700;color:#166534;">✓ 請求内容に同意済み</p>
          <p style="margin:0;">${escape(p.customerName)} 様は、上記の請求書に記載の作業項目と金額を確認し、請求内容に同意・署名されました。</p>
          <p style="margin:6px 0 0;font-size:11px;color:#15803d;">同意日時: ${escape(fmtDateTime(p.agreedAt))}</p>
        </td>
      </tr>
    </table>`

  // セクション順: 売買契約書 → 特商法 → 売買同意 → 請求書 → 請求書同意
  return saleContract + legal + saleConsent + invoice + invoiceConsent
}

/** プレーンテキスト版（HTMLが表示できないメーラ用） */
export function buildContractBodyText(p: ContractEmailParams): string {
  const purchaseTotal = p.purchaseItems.reduce((s, i) => s + i.price * i.quantity, 0)
  const workTotal = p.workItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
  const coolingOffEnd = addDays(p.contractDate, 7)
  const sellerName = p.operator ? formalName(p.operator) : p.storeName
  const sellerAddress = p.operator?.address || p.storeAddress || ''

  const lines: string[] = []
  lines.push('========================================')
  lines.push(`売買契約書（契約番号: ${p.contractNo}）`)
  lines.push('========================================')
  lines.push(`契約日: ${fmtDate(p.contractDate)}`)
  lines.push(`訪問日: ${fmtDate(p.visitDate)}`)
  lines.push('')
  lines.push('【お客様情報（売主）】')
  lines.push(`氏名: ${p.customerName}`)
  lines.push(`住所: ${p.customerAddress}`)
  lines.push(`電話: ${p.customerPhone}`)
  if (p.customerIdType) lines.push(`本人確認: ${p.customerIdType}`)
  lines.push('')
  lines.push('【買取業者情報（買主）】')
  lines.push(`店舗名: ${storeContractName(p.storeName)}`)
  if (p.storeAddress) lines.push(`住所: ${p.storeAddress}`)
  if (p.storePhone) lines.push(`電話: ${p.storePhone}`)
  if (p.staffName) lines.push(`担当者: ${p.staffName}`)
  lines.push('')
  // 再訪問日（後日引取）
  {
    const revisitDt = p.revisitDate ? (typeof p.revisitDate === 'string' ? new Date(p.revisitDate) : p.revisitDate) : null
    if (revisitDt && !isNaN(revisitDt.getTime())) {
      const timeStr = [p.revisitStart, p.revisitEnd].filter(Boolean).join('〜')
      lines.push(`【再訪問日（後日引取）】`)
      lines.push(`日付: ${fmtDate(revisitDt)}${timeStr ? `  時間: ${timeStr}` : ''}`)
      if (p.revisitNote) lines.push(`メモ: ${p.revisitNote}`)
      lines.push('')
    }
  }
  lines.push('【買取品目】')
  if (p.purchaseItems.length === 0) lines.push('(なし)')
  else {
    p.purchaseItems.forEach(i => {
      lines.push(`・${i.itemName}${i.category ? `（${i.category}）` : ''}  ${i.quantity} × ${fmtYen(i.price)} = ${fmtYen(i.price * i.quantity)}`)
    })
    lines.push(`買取金額合計: ${fmtYen(purchaseTotal)}`)
  }
  lines.push('')
  lines.push('========================================')
  lines.push(`請求書（請求番号: ${p.invoiceNo}）`)
  lines.push('========================================')
  lines.push(`請求日: ${fmtDate(p.contractDate)}`)
  lines.push(`請求宛先: ${p.customerName} 様`)
  lines.push(`請求元: ${sellerName}`)
  if (sellerAddress) lines.push(`所在地: ${sellerAddress}`)
  lines.push('')
  lines.push('【作業項目】')
  if (p.workItems.length === 0) lines.push('(なし)')
  else {
    p.workItems.forEach(w => {
      lines.push(`・${w.workName}  ${w.quantity} × ${fmtYen(w.unitPrice)} = ${fmtYen(w.unitPrice * w.quantity)}`)
    })
    lines.push(`請求金額合計: ${fmtYen(workTotal)}`)
  }
  lines.push('')
  lines.push('【請求書 注意事項】')
  lines.push('1. お客様は、本書記載の家財道具・家具・その他動産類（対象物）について搬出・片付け・運搬等の作業（本作業）を当社へ依頼します。内容・金額は本書記載の見積内容によります。追加作業・追加費用が必要な場合は事前にご説明・ご了承のうえ実施し、追加費用をお支払いいただきます。')
  lines.push('2. お客様は、対象物に第三者の所有物・リース品・盗品・遺失物等が含まれないことを表明・保証します。')
  lines.push('3. お客様都合のキャンセル等の場合、作業日7日前から前日までは見積金額の10％、当日または作業員到着後は25％をキャンセル料としてお支払いいただきます。')
  lines.push('4. お客様に損害が生じた場合の当社の賠償範囲は直接かつ通常の損害に限り、賠償額は本書記載の作業代金額を上限とします（当社に故意・重過失がある場合を除く）。')
  lines.push('5. 本作業に起因する紛争は、弊社本店所在地を管轄する裁判所を管轄とします。')
  lines.push('')
  lines.push('【特定商取引法に基づく書面】')
  lines.push('本書面は、特定商取引法第58条の8に基づき交付する書面です。')
  lines.push('')
  lines.push('■クーリング・オフについて')
  lines.push('お客様が、訪問買取で本売買契約をご契約された場合、本書面を受け取った日から8日を経過するまでの間は書面または電磁的方法により本売買契約のクーリング・オフ（契約の解除）ができます。')
  lines.push(`クーリング・オフ期限: ${fmtDate(coolingOffEnd)}`)
  lines.push('クーリング・オフをした場合、損害賠償及び違約金の支払を請求されることは一切ありません。')
  lines.push('')
  lines.push('■買取時の確認事項')
  lines.push('・不意打ち的な勧誘や強制的な売買の勧誘を受けていません')
  lines.push('・搬出時の作業支援で発生した物品/建物への破損損害は購入業者の責任外です')
  lines.push('・贋作判明・虚偽申告時は購入業者が物品を返品し、代金返金となります')
  lines.push('・反社会的勢力ではないことを誓約します')
  lines.push('（詳細はメール上部のHTML本文または添付PDFをご確認ください）')
  lines.push('')
  lines.push('========================================')
  lines.push('【売買契約への同意】')
  lines.push('========================================')
  lines.push(`${p.customerName} 様は、上記の売買契約および特定商取引法に基づく書面の内容を理解し、売買契約に同意・署名されました。`)
  lines.push(`同意日時: ${fmtDateTime(p.agreedAt)}`)
  lines.push('')
  lines.push('========================================')
  lines.push('【請求書への同意】')
  lines.push('========================================')
  lines.push(`${p.customerName} 様は、上記の請求書に記載の作業項目と金額を確認し、請求内容に同意・署名されました。`)
  lines.push(`同意日時: ${fmtDateTime(p.agreedAt)}`)
  lines.push('')
  return lines.join('\n')
}
