import type { NextConfig } from 'next'

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
      "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://maps.googleapis.com https://maps.gstatic.com", // Next.js HMR 用 + Google Maps
      "style-src 'self' 'unsafe-inline'",
      // Vercel Blob の公開 URL + YouTube サムネイル + LINE プロフィール画像 + 地図タイル（OSM/Google）を img-src に追加
      "img-src 'self' data: blob: https://*.public.blob.vercel-storage.com https://img.youtube.com https://profile.line-scdn.net https://*.line-scdn.net https://*.tile.openstreetmap.org https://maps.googleapis.com https://maps.gstatic.com https://*.googleapis.com https://*.gstatic.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' https://*.public.blob.vercel-storage.com https://*.blob.vercel-storage.com https://vercel.com https://maps.googleapis.com https://maps.gstatic.com",
      // Vercel Blob の動画再生を許可
      "media-src 'self' https://*.public.blob.vercel-storage.com",
      // YouTube 埋め込み（研修動画）を許可
      "frame-src 'self' https://www.youtube.com https://youtube.com",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  // Prisma をバンドルせず Node.js ネイティブで解決（Vercel ビルド対応）
  serverExternalPackages: ['@prisma/client', 'prisma'],
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

export default nextConfig
