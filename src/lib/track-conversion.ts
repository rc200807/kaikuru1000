// フォーム/問い合わせの完了画面（thanks）からCVを記録するためのクライアント補助。
// t.js と同じ訪問者IDキー（_rct_vid）を使い、LP経由（_rctv）→第一者→新規生成の順に解決する。

const VID_KEY = '_rct_vid'

/** 訪問者IDを解決する。無ければ第一者として生成・保存する（直接流入でもCVを取りこぼさない）。 */
export function resolveVisitorKey(): string {
  // 1) クロスドメインリンカー由来（LPから引き継いだキー）
  try { const v = sessionStorage.getItem('_rct_vid_sys'); if (v) return v } catch {}
  // 2) 第一者 t.js キー（localStorage → cookie）
  try { const v = localStorage.getItem(VID_KEY); if (v) return v } catch {}
  try { const m = document.cookie.match(/(?:^|; )_rct_vid=([^;]+)/); if (m) return m[1] } catch {}
  // 3) 新規生成して第一者として保持（t.js と同じ形式）
  const gen = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12)
  try { localStorage.setItem(VID_KEY, gen) } catch {}
  try { document.cookie = `${VID_KEY}=${gen}; path=/; max-age=${60 * 60 * 24 * 730}; SameSite=Lax` } catch {}
  return gen
}

/** 完了画面表示をCVとして計測サーバーへ送る（sendBeaconはtext/plain必須）。 */
export function sendConversionBeacon(payload: { formSubmissionId?: string; inquiryId?: string }): void {
  if (!payload.formSubmissionId && !payload.inquiryId) return
  try {
    const body = JSON.stringify({ ...payload, visitorKey: resolveVisitorKey() })
    const url = '/api/track/conversion'
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))
    } else {
      fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body, keepalive: true }).catch(() => {})
    }
  } catch {}
}
