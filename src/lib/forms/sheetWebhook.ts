/** GAS Webhook へ回答データを POST する
 *
 * GAS Web App の挙動：
 *   1. /exec への POST で doPost() が実行され、シート書き込みなどの処理が完了する
 *   2. レスポンス本文は *.googleusercontent.com にキャッシュされ、302 で Location が返る
 *   3. クライアントはその Location を GET で取得して JSON 本文を得る
 *
 * したがって「初回 POST、リダイレクトは GET で追従」が正しい挙動。
 * 302 後も POST を再送すると googleusercontent.com から 405 が返る。
 *
 * Node の fetch は spec 準拠で 302 を POST→GET に変換するが、redirect:'follow' だと
 * 302 の Set-Cookie がリダイレクト先に引き継がれず Google 側で 401 が返ることがあるため、
 * redirect:'manual' で受けて Cookie を引き継ぎつつ自前で追従する。
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
  let method: 'POST' | 'GET' = 'POST'
  const cookieJar = new Map<string, string>() // name → value

  function buildCookieHeader(): string | undefined {
    if (cookieJar.size === 0) return undefined
    return Array.from(cookieJar.entries()).map(([k, v]) => `${k}=${v}`).join('; ')
  }
  function ingestSetCookie(res: Response) {
    const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] }
    const setCookies: string[] = typeof anyHeaders.getSetCookie === 'function'
      ? anyHeaders.getSetCookie()
      : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie') as string] : [])
    for (const sc of setCookies) {
      const first = sc.split(';')[0]
      const eq = first.indexOf('=')
      if (eq < 0) continue
      const name = first.slice(0, eq).trim()
      const value = first.slice(eq + 1).trim()
      if (name) cookieJar.set(name, value)
    }
  }

  try {
    for (let hop = 0; hop < 6; hop++) {
      const headers: Record<string, string> = {}
      if (method === 'POST') headers['Content-Type'] = 'application/json'
      const cookieHeader = buildCookieHeader()
      if (cookieHeader) headers['Cookie'] = cookieHeader

      const res = await fetch(url, {
        method,
        headers,
        body: method === 'POST' ? body : undefined,
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      })
      ingestSetCookie(res)

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (!loc) return { ok: false, error: `redirect ${res.status} without Location` }
        url = new URL(loc, url).toString()
        method = 'GET'
        continue
      }
      if (!res.ok) {
        const host = (() => { try { return new URL(url).host } catch { return 'unknown' } })()
        return { ok: false, error: `HTTP ${res.status} (${host})` }
      }
      return { ok: true }
    }
    return { ok: false, error: 'too many redirects' }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}
