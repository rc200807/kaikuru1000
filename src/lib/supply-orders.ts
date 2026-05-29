import { prisma } from '@/lib/prisma'
import { sendSlackNotification } from '@/lib/slack'

const yen = (n: number) => `¥${n.toLocaleString()}`

/**
 * 発注の決済を確定（pending → paid）し、初めて確定した場合のみ Slack 通知を送る。
 * pending を条件にした updateMany で「最初に確定した経路のみ」が通知するため、
 * Webhook と同期処理（GET）の二重送信を防げる。
 * @returns 今回この呼び出しで確定したら true
 */
export async function markSupplyOrderPaidAndNotify(orderId: string): Promise<boolean> {
  const result = await prisma.supplyOrder.updateMany({
    where: { id: orderId, paymentStatus: 'pending' },
    data: { paymentStatus: 'paid' },
  })
  if (result.count === 0) return false // 既に確定済み or 対象なし → 通知しない

  try {
    const order = await prisma.supplyOrder.findUnique({
      where: { id: orderId },
      include: { items: true },
    })
    if (!order) return true

    const lines = order.items
      .map(it => `• ${it.productName}${it.sizeName ? `（${it.sizeName}）` : ''} × ${it.quantity} — ${yen(it.subtotal)}`)
      .join('\n')

    const text = `:package: 備品の発注がありました（${order.orderNumber}）`
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: '🛒 備品の発注がありました', emoji: true } },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*発注番号:*\n${order.orderNumber}` },
          { type: 'mrkdwn', text: `*発注者:*\n${order.placedByName}` },
          { type: 'mrkdwn', text: `*合計金額:*\n${yen(order.totalAmount)}` },
          { type: 'mrkdwn', text: `*決済:*\n決済完了` },
        ],
      },
      { type: 'section', text: { type: 'mrkdwn', text: `*明細:*\n${lines}` } },
      ...(order.note ? [{ type: 'context', elements: [{ type: 'mrkdwn', text: `備考: ${order.note}` }] }] : []),
    ]

    await sendSlackNotification(text, blocks)
  } catch (e) {
    console.error('[supply-orders] slack notify failed', e)
  }
  return true
}
