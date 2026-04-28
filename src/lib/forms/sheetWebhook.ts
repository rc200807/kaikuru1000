/** GAS Webhook へ回答データを POST する */
export async function postToSheetWebhook(params: {
  url: string
  payload: {
    id: string
    submittedAt: string
    formTitle: string
    fields: Record<string, string>
  }
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(params.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params.payload),
      // GAS は redirect 時にリダイレクトされるので追従
      redirect: 'follow',
      // タイムアウト相当：AbortController で 10 秒
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` }
    }
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}
