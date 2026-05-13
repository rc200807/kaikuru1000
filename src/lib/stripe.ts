import Stripe from 'stripe'

/**
 * Stripe サーバーサイドクライアント。
 *
 * 環境変数:
 * - STRIPE_SECRET_KEY: テストは sk_test_*, 本番は sk_live_*
 * - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: フロントで使う（pk_test_* / pk_live_*）
 *
 * Vercel の Environment Variables に両方を設定してください。
 */
const secretKey = process.env.STRIPE_SECRET_KEY

export const stripe = secretKey
  ? new Stripe(secretKey, {
      // SDK 既定の最新版を使う。明示しないことでマイナーアップデートに追従。
      typescript: true,
    })
  : null

export function isStripeConfigured(): boolean {
  return !!secretKey
}

export function requireStripe(): Stripe {
  if (!stripe) {
    throw new Error('STRIPE_SECRET_KEY が未設定です。Vercel の環境変数を確認してください。')
  }
  return stripe
}
