import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// 本番でクエリログを出すと 1 リクエストあたり数十行の SQL 文字列を組み立てて
// ログ転送するぶんだけ遅くなる（分析系の多クエリAPIで特に響く）ので開発時のみ。
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
