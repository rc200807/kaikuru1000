'use client'

import { RECEIPT_ISSUER } from '@/lib/company-info'
import { formatJstDate } from '@/lib/datetime'

export type ReceiptData = {
  receiptNumber: string
  receiptName: string
  amount: number
  description: string
  paidAt: string | null
  issuedAt: string | null
}

/**
 * 領収書のA4印刷レイアウト（elementToPdf でPDF化する前提のオフスクリーンDOM）。
 * html2canvas でラスタライズされるため、色は固定値・レイアウトはインラインで完結させる。
 */
export default function ReceiptPrintable({ data }: { data: ReceiptData }) {
  const tax = Math.floor(data.amount * 10 / 110) // 内消費税（10%）
  const issueDate = data.issuedAt ?? new Date().toISOString()

  return (
    <div style={{ width: 720, padding: '56px 64px', background: '#ffffff', color: '#1a1a1a', fontFamily: 'sans-serif' }}>
      {/* ヘッダー */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 16 }}>領収書</div>
        <div style={{ fontSize: 12, textAlign: 'right', lineHeight: 1.9 }}>
          <div>領収書番号: {data.receiptNumber}</div>
          <div>発行日: {formatJstDate(issueDate)}</div>
        </div>
      </div>

      {/* 宛名 */}
      <div style={{ marginTop: 44, fontSize: 20, fontWeight: 600, borderBottom: '2px solid #1a1a1a', paddingBottom: 8, display: 'inline-block', minWidth: 320 }}>
        {data.receiptName}<span style={{ fontSize: 14, fontWeight: 400, marginLeft: 12 }}>様</span>
      </div>

      {/* 金額 */}
      <div style={{ marginTop: 40, textAlign: 'center' }}>
        <div style={{ display: 'inline-block', border: '2px solid #1a1a1a', padding: '14px 48px', fontSize: 30, fontWeight: 700, letterSpacing: 2 }}>
          ¥{data.amount.toLocaleString()}<span style={{ fontSize: 14, fontWeight: 400, marginLeft: 8 }}>-（税込）</span>
        </div>
        <div style={{ marginTop: 12, fontSize: 13 }}>上記正に領収いたしました</div>
      </div>

      {/* 明細 */}
      <table style={{ width: '100%', marginTop: 36, fontSize: 13, borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ padding: '8px 0', width: 120, color: '#555' }}>但し書き</td>
            <td style={{ padding: '8px 0' }}>但し {data.description} として</td>
          </tr>
          <tr>
            <td style={{ padding: '8px 0', color: '#555' }}>内消費税（10%）</td>
            <td style={{ padding: '8px 0' }}>¥{tax.toLocaleString()}</td>
          </tr>
          <tr>
            <td style={{ padding: '8px 0', color: '#555' }}>支払方法</td>
            <td style={{ padding: '8px 0' }}>クレジットカード{data.paidAt ? `（${formatJstDate(data.paidAt)} 決済）` : ''}</td>
          </tr>
        </tbody>
      </table>

      {/* 発行者 */}
      <div style={{ marginTop: 48, display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ fontSize: 13, lineHeight: 2, textAlign: 'left' }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{RECEIPT_ISSUER.name}</div>
          {RECEIPT_ISSUER.address && <div>{RECEIPT_ISSUER.address}</div>}
          {RECEIPT_ISSUER.tel && <div>TEL: {RECEIPT_ISSUER.tel}</div>}
          {RECEIPT_ISSUER.email && <div>{RECEIPT_ISSUER.email}</div>}
          {RECEIPT_ISSUER.invoiceRegistrationNumber && <div>登録番号: {RECEIPT_ISSUER.invoiceRegistrationNumber}</div>}
        </div>
      </div>

      {/* 注記 */}
      <div style={{ marginTop: 40, fontSize: 10, color: '#777', borderTop: '1px solid #ddd', paddingTop: 10 }}>
        本領収書は電子的に発行されたものであり、印紙税法基本通達第44条により収入印紙は不要です。
      </div>
    </div>
  )
}
