/**
 * Cloudflare Turnstile (CAPTCHA) 検証
 *
 * 環境変数:
 *   - TURNSTILE_SECRET_KEY: シークレットキー（サーバー側）
 *   - NEXT_PUBLIC_TURNSTILE_SITE_KEY: サイトキー（クライアント側で公開）
 *
 * 環境変数が未設定の場合は検証をスキップ（開発環境向け）
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export type TurnstileResult = {
  success: boolean
  errorCodes?: string[]
}

export async function verifyTurnstile(
  token: string | null | undefined,
  remoteIp?: string,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY

  // 環境変数未設定 → 検証スキップ（開発環境）
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[turnstile] TURNSTILE_SECRET_KEY is not set in production')
    }
    return { success: true }
  }

  // トークン未提供 → 失敗
  if (!token) {
    return { success: false, errorCodes: ['missing-input-response'] }
  }

  try {
    const formData = new URLSearchParams()
    formData.append('secret', secret)
    formData.append('response', token)
    if (remoteIp && remoteIp !== 'unknown') {
      formData.append('remoteip', remoteIp)
    }

    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      body: formData,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })

    if (!res.ok) {
      console.error('[turnstile] verify request failed:', res.status)
      return { success: false, errorCodes: ['network-error'] }
    }

    const data = await res.json() as { success: boolean; 'error-codes'?: string[] }

    return {
      success: data.success,
      errorCodes: data['error-codes'],
    }
  } catch (err: any) {
    console.error('[turnstile] verify error:', err?.message ?? err)
    return { success: false, errorCodes: ['exception'] }
  }
}
