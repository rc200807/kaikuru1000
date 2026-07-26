// 空き家管理案件へのアクセス権解決（APIルート共用ヘルパー）
import { prisma } from '@/lib/prisma'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

/** 案件へのアクセス権を解決（店舗=自店舗のみ、管理者=全件） */
export async function resolveAkiyaCaseAccess(id: string, sessionUser: any) {
  const akiyaCase = await prisma.akiyaCase.findUnique({
    where: { id },
    select: { id: true, storeId: true, photoUrls: true, lastVisitedAt: true },
  })
  if (!akiyaCase) return { error: '案件が見つかりません', status: 404 as const }
  const isStore = sessionUser.role === 'store'
  const isAdmin = ADMIN_ROLES.includes(sessionUser.role)
  if (!isStore && !isAdmin) return { error: 'Forbidden', status: 403 as const }
  if (isStore && akiyaCase.storeId !== sessionUser.id) return { error: 'Forbidden', status: 403 as const }
  return { akiyaCase, isAdmin }
}
