import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { isLoginBlocked, recordLoginFailure, resetLoginFailures } from './rate-limit'
import { recordAccessLog } from './access-log'
import { recordLinkPartnerActivity } from './link-partner-activity'
import { hashLoginToken } from './webauthn'
import {
  createDeviceSession,
  IDLE_SESSION_MS,
  ABSOLUTE_SESSION_MS,
  validateDeviceSession,
  PASSKEY_SESSION_MS,
  PASSWORD_SESSION_MS,
} from './device-session'

/**
 * DeviceSession の userType / userId をトークンから決める。
 * 失効側（revokeAllDeviceSessions）の呼び出しと同じ組み合わせにすること。
 *   店舗オーナー: ('store', storeId) / 店舗メンバー: ('storeMember', memberId)
 *   管理・システム管理: ('admin', adminId)
 */
function deviceSessionTargetFor(token: any): { userType: string; userId: string; memberId: string | null } | null {
  const id = token.id as string | undefined
  if (!id) return null
  if (token.role === 'store') {
    const memberId = (token.memberId as string | null) ?? null
    return memberId
      ? { userType: 'storeMember', userId: memberId, memberId }
      : { userType: 'store', userId: id, memberId: null }
  }
  if (['admin', 'superadmin', 'hr', 'sysadmin'].includes(token.role as string)) {
    return { userType: 'admin', userId: id, memberId: null }
  }
  // 顧客・パートナー・連携パートナーは失効導線が無いので発行しない（従来どおり）
  return null
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    // Cookie自体の上限は30日。実際の有効期限はログイン方法別に
    // jwt callback の sessionExpiresAt で制御する（パスワード=8時間 / パスキー=30日）
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: '/login',
  },
  providers: [
    // 顧客ログイン
    CredentialsProvider({
      id: 'customer',
      name: '顧客',
      credentials: {
        email: { label: 'メールアドレスまたは電話番号', type: 'text' },
        password: { label: 'パスワード', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null

        const loginId = credentials.email.trim()
        const key = `customer:${loginId}`
        const { blocked, remainingMs } = await isLoginBlocked(key)
        if (blocked) {
          const mins = Math.ceil((remainingMs ?? 0) / 60000)
          throw new Error(`ログインがブロックされています。${mins}分後に再試行してください`)
        }

        // メールアドレスか電話番号かを判定して検索
        const isEmail = loginId.includes('@')
        let user: any = null
        if (isEmail) {
          user = await prisma.user.findUnique({
            where: { email: loginId },
            include: { store: true },
          })
        } else {
          // 電話番号で検索（ハイフン除去して統一）
          const normalizedPhone = loginId.replace(/[-ー\s]/g, '')
          const users = await prisma.user.findMany({
            where: { phone: normalizedPhone },
            include: { store: true },
          })
          for (const u of users) {
            const valid = await bcrypt.compare(credentials.password, u.password)
            if (valid) {
              await resetLoginFailures(key)
              await recordAccessLog({ userType: 'customer', userId: u.id, userName: u.name, action: 'login', req })
              return {
                id: u.id,
                email: u.email || '',
                name: u.name,
                avatar: null,
                role: 'customer' as const,
                customerType: u.customerType,
                customerTypes: u.customerTypes,
              }
            }
          }
          if (users.length > 0) {
            await recordLoginFailure(key)
            return null
          }
        }

        if (!user) {
          await recordLoginFailure(key)
          return null
        }

        const isValid = await bcrypt.compare(credentials.password, user.password)
        if (!isValid) {
          await recordLoginFailure(key)
          return null
        }

        await resetLoginFailures(key)
        await recordAccessLog({ userType: 'customer', userId: user.id, userName: user.name, action: 'login', req })
        return {
          id: user.id,
          email: user.email || '',
          name: user.name,
          avatar: null,
          role: 'customer' as const,
          customerType: user.customerType,
          customerTypes: user.customerTypes,
        }
      },
    }),
    // 店舗ログイン（店舗アカウント or 店舗メンバー）
    CredentialsProvider({
      id: 'store',
      name: '店舗',
      credentials: {
        email: { label: 'メールアドレス', type: 'email' },
        password: { label: 'パスワード', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null

        const key = `store:${credentials.email}`
        const { blocked, remainingMs } = await isLoginBlocked(key)
        if (blocked) {
          const mins = Math.ceil((remainingMs ?? 0) / 60000)
          throw new Error(`ログインがブロックされています。${mins}分後に再試行してください`)
        }

        // 店舗アカウントを確認（同一メールで複数店舗の場合、パスワードが一致する店舗にログイン）
        const stores = await prisma.store.findMany({
          where: { email: credentials.email },
        })
        for (const store of stores) {
          const isValid = await bcrypt.compare(credentials.password, store.password)
          if (isValid) {
            await resetLoginFailures(key)
            await recordAccessLog({ userType: 'store', userId: store.id, userName: store.name, action: 'login', req })
            return {
              id: store.id,
              email: store.email || '',
              name: store.name,
              avatar: store.avatar || null,
              role: 'store' as const,
            }
          }
        }
        if (stores.length > 0) {
          // メールは見つかったがパスワードが一致しない
          await recordLoginFailure(key)
          return null
        }

        // 店舗メンバーアカウントを確認（同一メールで複数店舗のメンバーの場合あり）
        const members = await prisma.storeMember.findMany({
          where: { email: credentials.email },
          include: { store: true },
        })
        for (const member of members) {
          const isValid = await bcrypt.compare(credentials.password, member.password)
          if (isValid) {
            await resetLoginFailures(key)
            await recordAccessLog({ userType: 'store', userId: member.storeId, userName: member.name, memberId: member.id, action: 'login', req })
            return {
              id: member.storeId,
              email: member.email,
              name: member.name,
              avatar: member.avatar || null,
              role: 'store' as const,
              // メンバー本人の識別子（行動帰属用。id は互換のため storeId のまま）
              memberId: member.id,
              memberName: member.name,
            }
          }
        }

        // どのアカウントにも一致しなかった
        await recordLoginFailure(key)
        return null
      },
    }),
    // 管理者ログイン
    CredentialsProvider({
      id: 'admin',
      name: '管理者',
      credentials: {
        email: { label: 'メールアドレス', type: 'email' },
        password: { label: 'パスワード', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null

        // credentials.email は「メールアドレス または ログインID」を受け付ける
        const identifier = credentials.email
        const key = `admin:${identifier}`
        const { blocked, remainingMs } = await isLoginBlocked(key)
        if (blocked) {
          const mins = Math.ceil((remainingMs ?? 0) / 60000)
          throw new Error(`ログインがブロックされています。${mins}分後に再試行してください`)
        }

        // 同一メールが複数 Admin 行に存在しうる（管理ポータル用とシステム管理者用）。
        // 管理ポータルからは sysadmin 以外の行のみ対象にする。
        // メール または ログインID の両方で照合対象を集める。
        const admins = await prisma.admin.findMany({
          where: { OR: [{ email: identifier }, { loginId: identifier }] },
        })
        const candidates = admins.filter(a => a.role !== 'sysadmin')

        for (const admin of candidates) {
          const isValid = await bcrypt.compare(credentials.password, admin.password)
          if (isValid) {
            // ID+パスワード方式のパスキー必須制御:
            // パスキー登録前（pending_passkey）のみパスワードログインを許可し、
            // 登録後（pending_approval / active）はパスワードでのログインを拒否する。
            if (admin.authMethod === 'idpass' && admin.status !== 'pending_passkey') {
              await resetLoginFailures(key)
              throw new Error('このアカウントはパスキーでログインしてください')
            }
            await resetLoginFailures(key)
            const adminRole = (admin.role === 'superadmin' || admin.role === 'hr') ? admin.role : 'admin'
            await recordAccessLog({ userType: adminRole, userId: admin.id, userName: admin.name, action: 'login', req })
            return {
              id: admin.id,
              email: admin.email,
              name: admin.name,
              avatar: admin.avatar || null,
              role: adminRole,
              adminStatus: admin.status,
              authMethod: admin.authMethod,
            }
          }
        }

        await recordLoginFailure(key)
        return null
      },
    }),
    // システム管理者ログイン（運営者専用 / role==='sysadmin' のみ）
    CredentialsProvider({
      id: 'sysadmin',
      name: 'システム管理者',
      credentials: {
        email: { label: 'メールアドレス', type: 'email' },
        password: { label: 'パスワード', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null

        const key = `sysadmin:${credentials.email}`
        const { blocked, remainingMs } = await isLoginBlocked(key)
        if (blocked) {
          const mins = Math.ceil((remainingMs ?? 0) / 60000)
          throw new Error(`ログインがブロックされています。${mins}分後に再試行してください`)
        }

        // 同一メールが複数 Admin 行に存在しうるため、sysadmin の行のみ対象にする
        const admins = await prisma.admin.findMany({
          where: { email: credentials.email },
        })
        const candidates = admins.filter(a => a.role === 'sysadmin')

        for (const admin of candidates) {
          const isValid = await bcrypt.compare(credentials.password, admin.password)
          if (isValid) {
            await resetLoginFailures(key)
            await recordAccessLog({ userType: 'sysadmin', userId: admin.id, userName: admin.name, action: 'login', req })
            return {
              id: admin.id,
              email: admin.email,
              name: admin.name,
              avatar: admin.avatar || null,
              role: 'sysadmin' as const,
            }
          }
        }

        await recordLoginFailure(key)
        return null
      },
    }),
    // セールスパートナーログイン
    CredentialsProvider({
      id: 'partner',
      name: 'セールスパートナー',
      credentials: {
        email: { label: 'メールアドレス', type: 'email' },
        password: { label: 'パスワード', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null

        const key = `partner:${credentials.email}`
        const { blocked, remainingMs } = await isLoginBlocked(key)
        if (blocked) {
          const mins = Math.ceil((remainingMs ?? 0) / 60000)
          throw new Error(`ログインがブロックされています。${mins}分後に再試行してください`)
        }

        const partner = await prisma.salesPartner.findUnique({
          where: { email: credentials.email },
        })

        if (!partner || !partner.isActive || !partner.password) {
          await recordLoginFailure(key)
          return null
        }

        const isValid = await bcrypt.compare(credentials.password, partner.password)
        if (!isValid) {
          await recordLoginFailure(key)
          return null
        }

        await resetLoginFailures(key)
        await recordAccessLog({ userType: 'partner', userId: partner.id, userName: partner.name, action: 'login', req })
        return {
          id: partner.id,
          email: partner.email,
          name: partner.name,
          avatar: null,
          role: 'partner' as const,
        }
      },
    }),
    // 連携パートナー ログイン（外部連携パートナーのメンバー。パスワード方式・8時間セッション）
    CredentialsProvider({
      id: 'linkpartner',
      name: '連携パートナー',
      credentials: {
        email: { label: 'メールアドレス', type: 'email' },
        password: { label: 'パスワード', type: 'password' },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null

        const key = `linkpartner:${credentials.email}`
        const { blocked, remainingMs } = await isLoginBlocked(key)
        if (blocked) {
          const mins = Math.ceil((remainingMs ?? 0) / 60000)
          throw new Error(`ログインがブロックされています。${mins}分後に再試行してください`)
        }

        const member = await prisma.linkPartnerMember.findUnique({
          where: { email: credentials.email },
          include: { linkPartner: true },
        })

        // メンバー自身・所属組織の双方が有効でパスワード設定済みのときのみ許可
        // （組織を無効化すると全メンバーのログインが遮断される）
        if (
          !member ||
          !member.password ||
          !member.isActive ||
          !member.linkPartner ||
          !member.linkPartner.isActive
        ) {
          await recordLoginFailure(key)
          return null
        }

        const isValid = await bcrypt.compare(credentials.password, member.password)
        if (!isValid) {
          await recordLoginFailure(key)
          return null
        }

        await resetLoginFailures(key)
        await prisma.linkPartnerMember.update({
          where: { id: member.id },
          data: { lastLoginAt: new Date() },
        })
        await recordLinkPartnerActivity({
          linkPartnerId: member.linkPartnerId,
          memberId: member.id,
          memberName: member.name,
          action: 'login',
          req,
        })
        return {
          id: member.id,
          email: member.email,
          name: member.name,
          avatar: null,
          role: 'linkpartner' as const,
          linkPartnerId: member.linkPartnerId,
          partnerRole: member.role,
          mustChangePassword: member.mustChangePassword,
        }
      },
    }),
    // マジックリンクログイン（顧客用）
    CredentialsProvider({
      id: 'magic-link',
      name: 'マジックリンク',
      credentials: {
        token: { label: 'Token', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.token) return null

        const magicLink = await prisma.magicLink.findUnique({
          where: { token: credentials.token },
          include: { user: true },
        })

        if (!magicLink || magicLink.usedAt || magicLink.expiresAt < new Date()) {
          return null
        }

        // トークンを使用済みにマーク
        await prisma.magicLink.update({
          where: { id: magicLink.id },
          data: { usedAt: new Date() },
        })

        return {
          id: magicLink.user.id,
          email: magicLink.user.email || '',
          name: magicLink.user.name,
          avatar: null,
          role: 'customer' as const,
          customerType: (magicLink.user as any).customerType,
          customerTypes: (magicLink.user as any).customerTypes,
        }
      },
    }),
    // パスキー（WebAuthn）ログイン
    // /api/auth/webauthn/login/verify で検証済みのワンタイムトークンを受け取り、セッションを発行する
    CredentialsProvider({
      id: 'webauthn',
      name: 'パスキー',
      credentials: {
        token: { label: 'Token', type: 'text' },
      },
      async authorize(credentials, req) {
        if (!credentials?.token) return null

        // ワンタイム消費（アトミック）: 使用済み・期限切れは弾く
        const tokenHash = hashLoginToken(credentials.token)
        const consumed = await prisma.passkeyLoginToken.updateMany({
          where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        })
        if (consumed.count === 0) return null
        const loginToken = await prisma.passkeyLoginToken.findUnique({
          where: { tokenHash },
        })
        if (!loginToken) return null

        const headers = (req as any)?.headers
        const fwd = typeof headers?.get === 'function'
          ? headers.get('x-forwarded-for')
          : headers?.['x-forwarded-for']
        const ip = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() || null
        const userAgent = typeof headers?.get === 'function'
          ? headers.get('user-agent')
          : headers?.['user-agent'] ?? null

        // 管理者（admin/superadmin/hr/sysadmin）
        if (loginToken.userType === 'admin') {
          const admin = await prisma.admin.findUnique({ where: { id: loginToken.userId } })
          if (!admin) return null
          const role = admin.role === 'sysadmin'
            ? 'sysadmin'
            : (admin.role === 'superadmin' || admin.role === 'hr') ? admin.role : 'admin'
          // idpass方式でパスキー登録直後（pending_passkey）にパスキーログインしてきた場合は
          // 承認待ちへ前進（DBも更新して superadmin が承認できる状態にする。passkey-complete 未通過の保険）
          let adminStatus = admin.status
          if (admin.authMethod === 'idpass' && admin.status === 'pending_passkey') {
            adminStatus = 'pending_approval'
            await prisma.admin.update({ where: { id: admin.id }, data: { status: 'pending_approval' } })
          }
          const deviceSessionId = await createDeviceSession({
            userType: 'admin', userId: admin.id,
            credentialId: loginToken.credentialId, loginMethod: 'passkey', ip, userAgent,
          })
          await recordAccessLog({ userType: role, userId: admin.id, userName: admin.name, action: 'login-passkey', req })
          return {
            id: admin.id,
            email: admin.email,
            name: admin.name,
            avatar: admin.avatar || null,
            role,
            adminStatus,
            authMethod: admin.authMethod,
            loginMethod: 'passkey',
            deviceSessionId,
          }
        }

        // 店舗アカウント
        if (loginToken.userType === 'store') {
          const store = await prisma.store.findUnique({ where: { id: loginToken.userId } })
          if (!store) return null
          const deviceSessionId = await createDeviceSession({
            userType: 'store', userId: store.id,
            credentialId: loginToken.credentialId, loginMethod: 'passkey', ip, userAgent,
          })
          await recordAccessLog({ userType: 'store', userId: store.id, userName: store.name, action: 'login-passkey', req })
          return {
            id: store.id,
            email: store.email || '',
            name: store.name,
            avatar: store.avatar || null,
            role: 'store' as const,
            loginMethod: 'passkey',
            deviceSessionId,
          }
        }

        // 店舗メンバー
        if (loginToken.userType === 'storeMember') {
          const member = await prisma.storeMember.findUnique({
            where: { id: loginToken.userId },
          })
          if (!member) return null
          const deviceSessionId = await createDeviceSession({
            userType: 'storeMember', userId: member.id, memberId: member.id,
            credentialId: loginToken.credentialId, loginMethod: 'passkey', ip, userAgent,
          })
          await recordAccessLog({ userType: 'store', userId: member.storeId, userName: member.name, memberId: member.id, action: 'login-passkey', req })
          return {
            id: member.storeId,
            email: member.email,
            name: member.name,
            avatar: member.avatar || null,
            role: 'store' as const,
            memberId: member.id,
            memberName: member.name,
            loginMethod: 'passkey',
            deviceSessionId,
          }
        }

        return null
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session: updatedSession }) {
      if (user) {
        token.role = (user as any).role
        token.id = user.id
        token.avatar = (user as any).avatar ?? null
        token.customerType = (user as any).customerType ?? null
        token.customerTypes = (user as any).customerTypes ?? null
        // 店舗メンバーとしてのログイン時のみ設定される（店舗アカウント直ログインでは null）
        token.memberId = (user as any).memberId ?? null
        token.memberName = (user as any).memberName ?? null
        // 管理者アカウントの状態（idpass方式のパスキー必須・承認フロー用）
        token.adminStatus = (user as any).adminStatus ?? 'active'
        token.authMethod = (user as any).authMethod ?? 'email'
        // 連携パートナー用（linkpartner ロールのみ設定される）
        token.linkPartnerId = (user as any).linkPartnerId ?? null
        token.partnerRole = (user as any).partnerRole ?? null
        token.mustChangePassword = (user as any).mustChangePassword ?? false
        // セッションはスライディング（無操作で切れる）方式。
        // ログイン時刻を固定の期限にすると、使い続けていても時間で強制ログアウトされてしまう。
        const loginMethod = (user as any).loginMethod === 'passkey' ? 'passkey' : 'password'
        token.loginMethod = loginMethod
        token.deviceSessionId = (user as any).deviceSessionId ?? null
        token.sessionStartedAt = Date.now()
        token.sessionExpiresAt = Date.now() + IDLE_SESSION_MS[loginMethod]

        // パスワードログインにもデバイスセッションを発行する。
        // セッションを無操作7日まで延ばした以上、パスワード変更・端末失効で他端末を
        // 切れないと危険なため（従来はパスキーのみ発行で、パスワードは失効不能だった）。
        // 各プロバイダに散らさずここで一括して作る。失敗してもログインは通す（従来どおり）。
        if (loginMethod === 'password' && !token.deviceSessionId) {
          const target = deviceSessionTargetFor(token)
          if (target) {
            token.deviceSessionId = await createDeviceSession({
              userType: target.userType,
              userId: target.userId,
              memberId: target.memberId,
              loginMethod: 'password',
            }).catch(e => {
              console.error('[auth] デバイスセッションの作成に失敗:', e)
              return null
            })
          }
        }
      }

      const method: 'password' | 'passkey' = token.loginMethod === 'passkey' ? 'passkey' : 'password'
      const now = Date.now()
      // 無操作期限。sessionExpiresAt を持たない旧トークンは iat+8時間（従来挙動のまま失効させる）
      const idleExpiry =
        (token.sessionExpiresAt as number | undefined) ??
        ((token.iat as number | undefined ?? 0) * 1000 + PASSWORD_SESSION_MS)
      // ログインからの絶対上限（スライディングでも無限には延ばさない）
      const startedAt = (token.sessionStartedAt as number | undefined)
        ?? ((token.iat as number | undefined ?? 0) * 1000)
      const hardExpiry = startedAt + ABSOLUTE_SESSION_MS[method]
      if (now > idleExpiry || now > hardExpiry) {
        // role/id を落として無効化（middleware・API の認可チェックが全て弾く）
        return { ...token, role: undefined, id: undefined, expired: true }
      }
      // 生きているセッションは、この呼び出し（＝利用があった証跡）で無操作期限を延ばす。
      // このコールバックは /api/auth/session の取得ごとに走り、トークンが再発行される。
      token.sessionExpiresAt = Math.min(now + IDLE_SESSION_MS[method], hardExpiry)
      // クライアントから update() が呼ばれたときにトークンを更新
      if (trigger === 'update' && updatedSession) {
        // 店舗切り替え
        if (updatedSession.switchStoreId && token.role === 'store') {
          const targetStore = await prisma.store.findUnique({
            where: { id: updatedSession.switchStoreId },
            select: { id: true, name: true, email: true, avatar: true },
          })
          if (targetStore) {
            token.id = targetStore.id
            token.name = targetStore.name
            token.email = targetStore.email || token.email
            token.avatar = targetStore.avatar || null
            // memberId / memberName は保持する（切替先店舗での作業も同一人物に帰属させる）
          }
        }
        if (updatedSession.name !== undefined) token.name = updatedSession.name
        if (updatedSession.email !== undefined) token.email = updatedSession.email
        if (updatedSession.avatar !== undefined) token.avatar = updatedSession.avatar
        if (updatedSession.customerType !== undefined) token.customerType = updatedSession.customerType
        if (updatedSession.customerTypes !== undefined) token.customerTypes = updatedSession.customerTypes
        // 連携パートナー: 初回パスワード変更後にゲート解除を即時反映
        if (updatedSession.mustChangePassword !== undefined) token.mustChangePassword = updatedSession.mustChangePassword
      }
      return token
    },
    async session({ session, token }) {
      // セッション無効時は「キーの無いオブジェクト」を返すこと。
      // next-auth v4 は返り値のキーが1つでもあれば認証済みとして扱うため
      // （client/_utils.js の Object.keys(data).length > 0 ? data : null、
      //   next/index.js の Object.keys(body).length 判定）、
      // 以前の { user: {}, expires: epoch } は status='authenticated' のまま
      // user.role だけ undefined になり、各画面のロール判定に落ちて
      // トップページ（顧客向け）へ飛ばされていた。
      // 空オブジェクトなら useSession は 'unauthenticated'、getServerSession は null になり、
      // middleware と同じくポータルごとのログイン画面へ誘導される。
      if ((token as any).expired || !token.role || !token.id) {
        return {} as any
      }
      // デバイス失効をDB照合（失効済みなら即無効化）。パスワードログインも対象。
      // deviceSessionId を持たない旧トークン・発行に失敗したセッションは従来どおり素通しにして、
      // 今回の変更で既存ログインが一斉に切れないようにする。
      if (token.deviceSessionId) {
        const valid = await validateDeviceSession(token.deviceSessionId as string)
        if (!valid) return {} as any
      }
      // 連携パートナー: パスワードセッション（DeviceSessionなし）のため、メンバー/組織の無効化を
      // 即時反映するよう毎回 isActive を DB 照合する（indexed findUnique 1回/req）。
      if (token.role === 'linkpartner') {
        const member = token.id
          ? await prisma.linkPartnerMember.findUnique({
              where: { id: token.id as string },
              select: { isActive: true, role: true, linkPartner: { select: { isActive: true } } },
            })
          : null
        if (!member || !member.isActive || !member.linkPartner?.isActive) return {} as any
        // 権限（partner_admin/member）の変更を即時反映
        ;(token as any).partnerRole = member.role
      }
      if (session.user) {
        (session.user as any).role = token.role
        ;(session.user as any).id = token.id
        ;(session.user as any).avatar = token.avatar ?? null
        ;(session.user as any).customerType = token.customerType ?? null
        ;(session.user as any).customerTypes = token.customerTypes ?? null
        ;(session.user as any).memberId = token.memberId ?? null
        ;(session.user as any).memberName = token.memberName ?? null
        ;(session.user as any).adminStatus = token.adminStatus ?? 'active'
        ;(session.user as any).authMethod = token.authMethod ?? 'email'
        ;(session.user as any).linkPartnerId = token.linkPartnerId ?? null
        ;(session.user as any).partnerRole = token.partnerRole ?? null
        ;(session.user as any).mustChangePassword = token.mustChangePassword ?? false
        if (token.name) session.user.name = token.name as string
        if (token.email) session.user.email = token.email as string
      }
      return session
    },
  },
}
