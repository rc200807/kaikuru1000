import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Roboto } from "next/font/google";
import Script from "next/script";

const roboto = Roboto({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  display: 'swap',
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://kaikuru.jp";

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
      <body className={`${roboto.className} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
