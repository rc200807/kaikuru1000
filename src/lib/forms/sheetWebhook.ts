/** GAS Webhook へ回答データを POST する
 *
 * GAS の Web App は script.google.com → googleusercontent.com への
 * 302 リダイレクトを返す。Node の fetch は spec 準拠で 302 を POST→GET に
 * 変換してボディを失うため、redirect:'manual' で受けて自前で再POSTする。
 */
export async function postToSheetWebhook(params: {
  url: string
  payload: {
    id: string
    submittedAt: string
    formTitle: string
    fields: Record<string, string>
  }
}): Promise<{ ok: boolean; error?: string }> {
  const body = JSON.stringify(params.payload)
  let url = params.url
  try {
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      })
      // 3xx はサーバー側のリダイレクトに従って再POST
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (!loc) return { ok: false, error: `redirect ${res.status} without Location` }
        url = new URL(loc, url).toString()
        continue
      }
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` }
      }
      return { ok: true }
    }
    return { ok: false, error: 'too many redirects' }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}
