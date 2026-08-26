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
  {
    prefix: '/linkpartner',
    roles: ['linkpartner'],
    loginPath: '/linkpartner/login',
    publicPaths: ['/linkpartner/login', '/linkpartner/invite'],
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
  matcher: ['/admin/:path*', '/sysadmin/:path*', '/store/:path*', '/partner/:path*', '/linkpartner/:path*'],
}
