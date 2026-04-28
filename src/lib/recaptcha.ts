/** reCAPTCHA v3 トークンをサーバー側で検証する */
export async function verifyRecaptcha(token: string | undefined): Promise<{ ok: boolean; score?: number; error?: string }> {
  const secret = process.env.RECAPTCHA_SECRET_KEY
  if (!secret) {
    // 未設定時はスキップ（開発体験のため）
    return { ok: true }
  }
  if (!token) {
    return { ok: false, error: 'reCAPTCHA トークンがありません' }
  }
  try {
    const body = new URLSearchParams({ secret, response: token })
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(5000),
    })
    const data = await res.json() as { success?: boolean; score?: number; 'error-codes'?: string[] }
    if (!data.success) {
      return { ok: false, error: (data['error-codes'] || []).join(',') || 'verification failed' }
    }
    if (typeof data.score === 'number' && data.score < 0.5) {
      return { ok: false, score: data.score, error: 'low score' }
    }
    return { ok: true, score: data.score }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}
