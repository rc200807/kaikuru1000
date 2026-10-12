/**
 * ページレベルのサーバーサイド認証ガード
 *
 * 各ポータル配下のページを NextAuth JWT で保護する（多層防御の1層目）。
 * API ルートは従来どおり各ルートの getServerSession が防御線（2層目）。
 * ただし営業パートナー・連携パートナー・sysadmin のセッションは、/api の入口で
 * 自分専用の API と共通・公開 API だけに絞る（下の API_ROLE_SCOPES）。
 * Edge Runtime で動作するため Prisma には依存しない（getToken は cookie 検証のみ）。
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// ポータルごとの許可ロールとログインページ
const PORTALS: { prefix: string; roles: string[]; loginPath: string; publicPaths: string[] }[] = [
  {
    prefix: '/admin',
    roles: ['admin', 'superadmin', 'hr'],
    loginPath: '/admin/login',
    publicPaths: ['/admin/login', '/admin/forgot-password', '/admin/reset-password'],
  },
  {
    prefix: '/sysadmin',
    roles: ['sysadmin'],
    loginPath: '/sysadmin/login',
    publicPaths: ['/sysadmin/login'],
  },
  {
    prefix: '/store',
    roles: ['store'],
    loginPath: '/store/login',
    publicPaths: ['/store/login', '/store/reset-password'],
  },
  {
    prefix: '/partner',
    roles: ['partner'],
    loginPath: '/partner/login',
    publicPaths: ['/partner/login', '/partner/invite'],
  },
  {
    prefix: '/linkpartner',
    roles: ['linkpartner'],
    loginPath: '/linkpartner/login',
    publicPaths: ['/linkpartner/login', '/linkpartner/invite'],
  },
]

// 社外向けロールと sysadmin が呼んでよい API。これ以外の /api はここで 403 にする。
// 店舗・管理向け API の多くは「顧客なら拒否、それ以外は許可」という書き方で、
// これらのロールが他人の顧客情報・身分証・契約書を読み書きできていたため、入口でまとめて止める。
const API_ROLE_SCOPES: Record<string, string[]> = {
  partner: ['/api/partner/'],
  linkpartner: ['/api/linkpartner/'],
  sysadmin: ['/api/sysadmin/', '/api/upload'],
}
// どのロールでも通す API（ログイン・パスキー、公開フォーム・計測など、公開サイトを見たときに呼ばれるもの）
const SHARED_API_PREFIXES = [
  '/api/auth/',
  '/api/forms/public/', '/api/inquiry', '/api/track/', '/api/tel/register',
  '/api/geo/', '/api/postal-lookup', '/api/zengin/',
  '/api/stores/public/', '/api/stores/search', '/api/store-login/',
  '/api/line/', '/api/license-keys/validate', '/api/magic-link/verify',
  '/api/webhooks/', '/api/cron/',
]

function matchesApiPrefix(pathname: string, prefix: string) {
  if (prefix.endsWith('/')) return pathname.startsWith(prefix)
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

async function guardApi(request: NextRequest, pathname: string) {
  if (SHARED_API_PREFIXES.some((p) => matchesApiPrefix(pathname, p))) return NextResponse.next()
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })
  const scopes = token?.role ? API_ROLE_SCOPES[token.role as string] : undefined
  // 顧客・店舗・管理者・未ログインは各ルートの認可に任せる
  if (!scopes) return NextResponse.next()
  if (scopes.some((p) => matchesApiPrefix(pathname, p))) return NextResponse.next()
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/api' || pathname.startsWith('/api/')) return guardApi(request, pathname)

  const portal = PORTALS.find(
    (p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`)
  )
  if (!portal) return NextResponse.next()

  // ログイン・パスワードリセット・招待受諾などの公開ページは素通し
  if (portal.publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next()
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })

  // 有効期限の検証。auth.ts の jwt コールバックと同じ判定にする
  // （無操作期限 sessionExpiresAt ＋ ログインからの絶対上限 sessionStartedAt）。
  // sessionExpiresAt はセッション取得のたびに延長されるので、使い続けている間は切れない。
  const PASSWORD_SESSION_MS = 8 * 60 * 60 * 1000
  const ABSOLUTE_MS = { password: 60 * 24 * 60 * 60 * 1000, passkey: 90 * 24 * 60 * 60 * 1000 }
  let isExpired = false
  if (token) {
    const now = Date.now()
    const iatMs = ((token.iat as number | undefined) ?? 0) * 1000
    const idleExpiry = (token.sessionExpiresAt as number | undefined) ?? (iatMs + PASSWORD_SESSION_MS)
    const startedAt = (token.sessionStartedAt as number | undefined) ?? iatMs
    const method = token.loginMethod === 'passkey' ? 'passkey' : 'password'
    isExpired = now > idleExpiry || now > startedAt + ABSOLUTE_MS[method]
  }

  // 未認証・期限切れ → 各ポータルのログインページへ
  if (!token?.role || !token?.id || isExpired) {
    const loginUrl = new URL(portal.loginPath, request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // 認証済みだがロール不一致 → トップへ（既存クライアントガードと同じ挙動）
  if (!portal.roles.includes(token.role as string)) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // 管理ポータル: 廃止した旧フロー（ID+パスワード方式のパスキー登録待ち/承認待ち）のトークンは
  // 承認を経ていないためログインし直させる（auth.ts の session callback でも無効化している）
  if (portal.prefix === '/admin') {
    const adminStatus = token.adminStatus as string | undefined
    if (adminStatus === 'pending_passkey' || adminStatus === 'pending_approval') {
      return NextResponse.redirect(new URL(portal.loginPath, request.url))
    }
  }

  // 連携パートナー: 初回ログイン（管理者が発行した初期パスワード）は強制変更ページへ誘導
  // （招待メンバーは自分でパスワードを設定するため mustChangePassword=false）
  if (portal.prefix === '/linkpartner') {
    const PW_PATH = '/linkpartner/onboarding/password'
    if (token.mustChangePassword === true) {
      if (pathname !== PW_PATH) return NextResponse.redirect(new URL(PW_PATH, request.url))
    } else if (pathname === PW_PATH) {
      return NextResponse.redirect(new URL('/linkpartner/dashboard', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/sysadmin/:path*', '/store/:path*', '/partner/:path*', '/linkpartner/:path*', '/api/:path*'],
}
