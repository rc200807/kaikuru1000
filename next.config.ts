import type { NextConfig } from 'next'
import bundleAnalyzer from '@next/bundle-analyzer'

// セキュリティヘッダー
// XSS・クリックジャッキング・MIMEスニッフィングなどの攻撃を防ぐ
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',  value: 'on' },
  { key: 'X-Frame-Options',         value: 'DENY' },
  { key: 'X-Content-Type-Options',  value: 'nosniff' },
  { key: 'Referrer-Policy',         value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',      value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'X-XSS-Protection',        value: '1; mode=block' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // Next.js HMR 用 + Google Maps + Stripe.js + Vercel Speed Insights/Analytics
      // （本番は同一オリジンの /_vercel/... で配信されるが、開発時とプロキシ不可時は va.vercel-scripts.com にフォールバックする）
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com https://js.stripe.com https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",
      // Vercel Blob の公開 URL + YouTube サムネイル + LINE プロフィール画像 + 地図タイル（OSM/Google）を img-src に追加
      "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://img.youtube.com https://profile.line-scdn.net https://*.line-scdn.net https://*.tile.openstreetmap.org https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://*.gstatic.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://*.public.blob.vercel-storage.com https://*.blob.vercel-storage.com https://vercel.com https://maps.googleapis.com https://maps.gstatic.com https://api.stripe.com https://va.vercel-scripts.com https://vitals.vercel-insights.com",
      // Vercel Blob の動画再生を許可
      "media-src 'self' https://*.public.blob.vercel-storage.com",
      // YouTube 埋め込み（研修動画）+ Vercel Blob の PDF プレビュー（チャット添付モーダル）+ Stripe（カード入力iframe）を許可
      "frame-src 'self' https://www.youtube.com https://youtube.com https://*.public.blob.vercel-storage.com https://js.stripe.com https://hooks.stripe.com",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  // Prisma をバンドルせず Node.js ネイティブで解決（Vercel ビルド対応）
  // sharp はネイティブバイナリを持つのでバンドルせず Node.js 側で解決させる（画像のWebP変換で使用）
  serverExternalPackages: ['@prisma/client', 'prisma', 'sharp'],
  async redirects() {
    return [
      // kaikuru1000.vercel.app へのアクセスは本番ドメインにリダイレクト
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'kaikuru1000.vercel.app' }],
        destination: 'https://system.rcinc.jp/:path*',
        permanent: true,
      },
    ]
  },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
  images: {
    remotePatterns: [
      {
        // Vercel Blob の公開ストレージドメイン
        protocol: 'https',
        hostname: '*.public.blob.vercel-storage.com',
      },
    ],
  },
}

// バンドルの内訳を見たいときだけ有効化する（本番ビルドには一切影響しない）:
//   ANALYZE=1 npx next build --webpack
// ※ 解析プラグインは webpack 前提のため、Turbopack ではなく --webpack で実行する
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === '1' })

export default withBundleAnalyzer(nextConfig)
