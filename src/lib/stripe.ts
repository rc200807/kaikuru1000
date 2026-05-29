import Stripe from 'stripe'

const secretKey = process.env.STRIPE_SECRET_KEY

if (!secretKey) {
  // ビルド時には未設定でも通すが、実行時に使うと throw する
  console.warn('[stripe] STRIPE_SECRET_KEY is not set')
}

// シングルトン（Next.js のホットリロードで複数生成しないよう globalThis にキャッシュ）
const globalForStripe = globalThis as unknown as { stripe?: Stripe }

export const stripe =
  globalForStripe.stripe ??
  new Stripe(secretKey ?? 'sk_test_placeholder', {
    apiVersion: '2026-05-27.dahlia',
    typescript: true,
  })

if (process.env.NODE_ENV !== 'production') globalForStripe.stripe = stripe
