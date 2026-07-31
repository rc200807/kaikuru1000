// クレーム対応APIの共通部品（一覧/詳細ルートで共有）。
// Next.js の route.ts は HTTP メソッド以外を export できないため、ここに切り出している。
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from './auth'
import { prisma } from './prisma'
import { COMPLAINT_STATUS_VALUES, STORE_OWNERSHIP_VALUES } from './complaint'

export async function requireComplaintAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin', 'superadmin', 'hr'].includes(user?.role)) return null
  return user as { id: string; role: string; name: string }
}

export const COMPLAINT_SELECT = {
  id: true, occurredOn: true, storeOwnership: true, status: true, content: true,
  storeId: true, primaryHandlerId: true, secondaryHandlerId: true, finalHandlerId: true,
  createdAt: true, updatedAt: true,
  store: { select: { id: true, name: true, code: true } },
  primaryHandler:   { select: { id: true, name: true } },
  secondaryHandler: { select: { id: true, name: true } },
  finalHandler:     { select: { id: true, name: true } },
} as const

/**
 * 対応者ID。空文字は「未選択」を意味するが、ここでは変換しない。
 * transform を挟むと、部分更新（PATCH）で送っていないキーまで undefined→null に
 * 化けて既存の対応者を消してしまうため、正規化は normalizeHandlerIds で
 * 「実際に送られてきたキーだけ」に対して行う。
 */
const handlerId = z.string().trim().nullable().optional()

export const COMPLAINT_HANDLER_KEYS = ['primaryHandlerId', 'secondaryHandlerId', 'finalHandlerId'] as const

/** 送られてきた対応者キーだけを 空文字→null に正規化する（未送信のキーは触らない） */
export function normalizeHandlerIds<T extends Record<string, unknown>>(data: T): T {
  for (const key of COMPLAINT_HANDLER_KEYS) {
    if (key in data) (data as Record<string, unknown>)[key] = (data[key] as string | null) || null
  }
  return data
}

export const complaintInputSchema = z.object({
  occurredOn:     z.string().min(1, '発生日は必須です'),
  storeId:        z.string().min(1, '対象店舗は必須です'),
  storeOwnership: z.enum(STORE_OWNERSHIP_VALUES as [string, ...string[]], { message: '直営／加盟店を選択してください' }),
  status:         z.enum(COMPLAINT_STATUS_VALUES as [string, ...string[]], { message: '状況・結果を選択してください' }),
  primaryHandlerId:   handlerId,
  secondaryHandlerId: handlerId,
  finalHandlerId:     handlerId,
  content:        z.string().trim().min(1, 'クレーム内容は必須です').max(20000),
})

/**
 * 指定された関連レコードが実在するか検証する。
 * 存在しないIDをそのまま保存すると外部キー違反で500になるため、手前で400に落とす。
 */
export async function validateComplaintRelations(input: {
  storeId: string
  primaryHandlerId: string | null
  secondaryHandlerId: string | null
  finalHandlerId: string | null
}): Promise<string | null> {
  const store = await prisma.store.findUnique({ where: { id: input.storeId }, select: { id: true } })
  if (!store) return '指定された店舗が見つかりません'

  const handlerIds = [input.primaryHandlerId, input.secondaryHandlerId, input.finalHandlerId]
    .filter((v): v is string => !!v)
  if (handlerIds.length > 0) {
    const found = await prisma.admin.findMany({
      where: { id: { in: [...new Set(handlerIds)] }, role: { not: 'sysadmin' } },
      select: { id: true },
    })
    const foundIds = new Set(found.map(a => a.id))
    if (handlerIds.some(id => !foundIds.has(id))) return '指定された対応者が見つかりません'
  }
  return null
}
