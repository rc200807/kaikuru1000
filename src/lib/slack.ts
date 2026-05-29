// Slack Incoming Webhook への通知（通知専用・ベストエフォート）
export async function sendSlackNotification(text: string, blocks?: any[]): Promise<boolean> {
  const url = process.env.SLACK_ORDER_WEBHOOK_URL
  if (!url) {
    console.warn('[slack] SLACK_ORDER_WEBHOOK_URL is not set; skip notification')
    return false
  }
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(blocks ? { text, blocks } : { text }),
    })
    if (!res.ok) {
      console.error('[slack] webhook responded', res.status, await res.text().catch(() => ''))
      return false
    }
    return true
  } catch (e) {
    console.error('[slack] notification failed', e)
    return false
  }
}
