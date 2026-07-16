/**
 * ページレベルのサーバーサイド認証ガード
 *
 * 各ポータル配下のページを NextAuth JWT で保護する（多層防御の1層目）。
 * API ルートは従来どおり各ルートの getServerSession が防御線（2層目）。
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
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const portal = PORTALS.find(
    (p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`)
  )
  if (!portal) return NextResponse.next()

  // ログイン・パスワードリセット・招待受諾などの公開ページは素通し
  if (portal.publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next()
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET })

  // 絶対有効期限の検証（パスワード=8時間 / パスキー=30日。旧トークンは iat+8時間）
  const PASSWORD_SESSION_MS = 8 * 60 * 60 * 1000
  const absoluteExpiry = token
    ? ((token.sessionExpiresAt as number | undefined) ??
       (((token.iat as number | undefined) ?? 0) * 1000 + PASSWORD_SESSION_MS))
    : 0
  const isExpired = token ? Date.now() > absoluteExpiry : false

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

  // 管理ポータル: ID+パスワード方式アカウントのオンボーディング状態で誘導
  // （email方式の既存管理者は adminStatus 未定義 or 'active' なので素通し）
  if (portal.prefix === '/admin') {
    const adminStatus = token.adminStatus as string | undefined
    const PASSKEY_PATH = '/admin/onboarding/passkey'
    const APPROVAL_PATH = '/admin/pending-approval'
    if (adminStatus === 'pending_passkey') {
      if (pathname !== PASSKEY_PATH) return NextResponse.redirect(new URL(PASSKEY_PATH, request.url))
    } else if (adminStatus === 'pending_approval') {
      if (pathname !== APPROVAL_PATH) return NextResponse.redirect(new URL(APPROVAL_PATH, request.url))
    } else {
      // active（通常）: オンボーディング用ページには入れない
      if (pathname === PASSKEY_PATH || pathname === APPROVAL_PATH) {
        return NextResponse.redirect(new URL('/admin/dashboard', request.url))
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*', '/sysadmin/:path*', '/store/:path*', '/partner/:path*'],
}
