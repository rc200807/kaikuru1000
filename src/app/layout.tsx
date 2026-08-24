import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Script from "next/script";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kaikuru.jp";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // maximumScale は省略（アクセシビリティのためユーザーズームを制限しない）
  // iOS Safari のフォーム入力時ズームは globals.css の font-size:16px で対応
};

export const metadata: Metadata = {
  title: "買いクル | 定期訪問サービス",
  description: "定期訪問サービス「買いクル」のマイページ。定期訪問・定期宅配のスケジュール確認、買取相談メモの管理、口座情報の登録などができます。",
  metadataBase: new URL(siteUrl),
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: "買いクル",
    title: "買いクル | 定期訪問サービス",
    description: "定期訪問サービス「買いクル」のマイページ。定期訪問・定期宅配のスケジュール確認、買取相談メモの管理などができます。",
    images: [
      {
        url: "/ogp.png",
        width: 1200,
        height: 630,
        alt: "買いクル | 定期訪問サービス",
      },
    ],
    locale: "ja_JP",
  },
  twitter: {
    card: "summary_large_image",
    title: "買いクル | 定期訪問サービス",
    description: "定期訪問サービス「買いクル」のマイページ。",
    images: ["/ogp.png"],
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icon.png", type: "image/png" },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-TM3EF04Z22" strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-TM3EF04Z22');`}
        </Script>
      </head>
      <body className={`${GeistSans.className} ${GeistMono.variable} antialiased`}>
        <Providers>{children}</Providers>
        {/* 実ユーザーの表示速度（LCP/INP/TTFB）をルート別に計測する。
            スクリプト・ビーコンとも同一オリジン（/_vercel/...）なので CSP の 'self' で通る */}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
