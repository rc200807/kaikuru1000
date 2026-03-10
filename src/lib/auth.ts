import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { isLoginBlocked, recordLoginFailure, resetLoginFailures } from './rate-limit'

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8時間でセッション失効
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
        email: { label: 'メールアドレス', type: 'email' },
        password: { label: 'パスワード', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const key = `customer:${credentials.email}`
        const { blocked, remainingMs } = await isLoginBlocked(key)
        if (blocked) {
          const mins = Math.ceil((remainingMs ?? 0) / 60000)
          throw new Error(`ログインがブロックされています。${mins}分後に再試行してください`)
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: { store: true },
        })

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
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: null,
          role: 'customer' as const,
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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const key = `store:${credentials.email}`
        const { blocked, remainingMs } = await isLoginBlocked(key)
        if (blocked) {
          const mins = Math.ceil((remainingMs ?? 0) / 60000)
          throw new Error(`ログインがブロックされています。${mins}分後に再試行してください`)
        }

        // 店舗アカウントを確認
        const store = await prisma.store.findFirst({
          where: { email: credentials.email },
        })
        if (store) {
          const isValid = await bcrypt.compare(credentials.password, store.password)
          if (!isValid) {
            await recordLoginFailure(key)
            return null
          }
          await resetLoginFailures(key)
          return {
            id: store.id,
            email: store.email || '',
            name: store.name,
            avatar: store.avatar || null,
            role: 'store' as const,
          }
        }

        // 店舗メンバーアカウントを確認
        const member = await prisma.storeMember.findUnique({
          where: { email: credentials.email },
          include: { store: true },
        })
        if (!member) {
          await recordLoginFailure(key)
          return null
        }

        const isValid = await bcrypt.compare(credentials.password, member.password)
        if (!isValid) {
          await recordLoginFailure(key)
          return null
        }

        await resetLoginFailures(key)
        // storeId をセッション id にして既存の店舗ポータルをそのまま使えるようにする
        return {
          id: member.storeId,
          email: member.email,
          name: member.name,
          avatar: member.avatar || null,
          role: 'store' as const,
        }
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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null

        const key = `admin:${credentials.email}`
        const { blocked, remainingMs } = await isLoginBlocked(key)
        if (blocked) {
          const mins = Math.ceil((remainingMs ?? 0) / 60000)
          throw new Error(`ログインがブロックされています。${mins}分後に再試行してください`)
        }

        const admin = await prisma.admin.findUnique({
          where: { email: credentials.email },
        })

        if (!admin) {
          await recordLoginFailure(key)
          return null
        }

        const isValid = await bcrypt.compare(credentials.password, admin.password)
        if (!isValid) {
          await recordLoginFailure(key)
          return null
        }

        await resetLoginFailures(key)
        return {
          id: admin.id,
          email: admin.email,
          name: admin.name,
          avatar: admin.avatar || null,
          role: 'admin' as const,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger, session: updatedSession }) {
      if (user) {
        token.role = (user as any).role
        token.id = user.id
        token.avatar = (user as any).avatar ?? null
      }
      // クライアントから update() が呼ばれたときにトークンを更新
      if (trigger === 'update' && updatedSession) {
        if (updatedSession.name !== undefined) token.name = updatedSession.name
        if (updatedSession.email !== undefined) token.email = updatedSession.email
        if (updatedSession.avatar !== undefined) token.avatar = updatedSession.avatar
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role
        ;(session.user as any).id = token.id
        ;(session.user as any).avatar = token.avatar ?? null
        if (token.name) session.user.name = token.name as string
        if (token.email) session.user.email = token.email as string
      }
      return session
    },
  },
}
