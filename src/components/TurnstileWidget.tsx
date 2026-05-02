'use client'

import { useEffect, useRef, useState } from 'react'

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string
          callback?: (token: string) => void
          'error-callback'?: () => void
          'expired-callback'?: () => void
          theme?: 'light' | 'dark' | 'auto'
          size?: 'normal' | 'compact'
        }
      ) => string
      reset: (widgetId?: string) => void
      remove: (widgetId: string) => void
    }
  }
}

type Props = {
  onVerify: (token: string) => void
  onError?: () => void
  onExpire?: () => void
  theme?: 'light' | 'dark' | 'auto'
  size?: 'normal' | 'compact'
}

/**
 * Cloudflare Turnstile (CAPTCHA) ウィジェット
 *
 * 環境変数 NEXT_PUBLIC_TURNSTILE_SITE_KEY が未設定の場合は何も表示しない
 * （= サーバー側の検証もスキップされる）
 */
export default function TurnstileWidget({ onVerify, onError, onExpire, theme = 'auto', size = 'normal' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [scriptLoaded, setScriptLoaded] = useState(false)

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

  // スクリプト読み込み
  useEffect(() => {
    if (!siteKey) return
    if (window.turnstile) {
      setScriptLoaded(true)
      return
    }

    const existing = document.querySelector('script[src*="challenges.cloudflare.com/turnstile"]')
    if (existing) {
      const onReady = () => setScriptLoaded(true)
      if (window.turnstile) onReady()
      else existing.addEventListener('load', onReady)
      return
    }

    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.defer = true
    script.onload = () => setScriptLoaded(true)
    document.head.appendChild(script)
  }, [siteKey])

  // ウィジェット描画
  useEffect(() => {
    if (!siteKey || !scriptLoaded || !containerRef.current || !window.turnstile) return
    if (widgetIdRef.current) return // 既に描画済み

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: onVerify,
      'error-callback': onError,
      'expired-callback': onExpire,
      theme,
      size,
    })

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch { /* ignore */ }
        widgetIdRef.current = null
      }
    }
  }, [scriptLoaded, siteKey, onVerify, onError, onExpire, theme, size])

  // サイトキー未設定 → 何も表示しない（バックエンドも検証スキップする想定）
  if (!siteKey) return null

  return <div ref={containerRef} />
}
