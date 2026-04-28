/** GAS Webhook へ回答データを POST する
 *
 * GAS Web App は script.google.com → *.googleusercontent.com への
 * 302 リダイレクトを返す。Node の fetch は spec 準拠で 302 を POST→GET に
 * 変換してボディを失うため、redirect:'manual' で受けて自前で再POSTする。
 * また 302 の Set-Cookie をリダイレクト先に引き継がないと Google 側で
 * 401 が返るため、Cookie の伝播も行う。
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
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const cookieHeader = buildCookieHeader()
      if (cookieHeader) headers['Cookie'] = cookieHeader

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(15000),
      })
      ingestSetCookie(res)

      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location')
        if (!loc) return { ok: false, error: `redirect ${res.status} without Location` }
        url = new URL(loc, url).toString()
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
