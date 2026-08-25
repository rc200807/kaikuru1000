// ナレッジベースAPIの共通部品（認可ヘルパと zod スキーマ）。
// Next.js の route.ts は HTTP メソッド以外を export できないため、ここに切り出す。
import { getServerSession } from 'next-auth'
import { z } from 'zod'
import { authOptions } from './auth'
import { FAQ_VISIBILITY_VALUES, KNOWLEDGE_QUERY_STATUS_VALUES } from './knowledge'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

export type KnowledgeAdmin = { id: string; role: string; name: string }

/** 管理ポータルの管理者のみ。FAQ・カテゴリーの登録編集はこちら */
export async function requireKnowledgeAdmin(): Promise<KnowledgeAdmin | null> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) return null
  return user as KnowledgeAdmin
}

/**
 * チャットの利用者（管理者・店舗の両方）を解決する。
 * 店舗はメンバーログインなら memberId を、店舗直ログインなら店舗IDを viewerId にする
 * （既読・作者識別で使われている readerId = memberId ?? storeId の定石。src/lib/chat.ts と同じ）。
 */
export type KnowledgeViewer = {
  viewerType: 'admin' | 'store'
  viewerId: string
  storeId: string | null
  displayName: string
  /** 管理者のみのFAQを参照できるか */
  canSeeAdminOnly: boolean
}

export async function resolveKnowledgeViewer(kind: 'admin' | 'store'): Promise<KnowledgeViewer | null> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !user) return null

  if (kind === 'admin') {
    if (!ADMIN_ROLES.includes(user.role)) return null
    return {
      viewerType: 'admin',
      viewerId: user.id as string,
      storeId: null,
      displayName: (user.name as string) ?? '管理者',
      canSeeAdminOnly: true,
    }
  }

  if (user.role !== 'store') return null
  const storeId = user.id as string
  const memberId = (user.memberId as string | null) ?? null
  return {
    viewerType: 'store',
    viewerId: memberId ?? storeId,
    storeId,
    displayName: (user.memberName as string) || (user.name as string) || '店舗',
    canSeeAdminOnly: false,
  }
}

// ─── zod スキーマ ───────────────────────────────────────

export const faqInputSchema = z.object({
  question:    z.string().trim().min(1, '質問は必須です').max(500),
  answer:      z.string().trim().min(1, '回答は必須です').max(100000),
  categoryId:  z.string().trim().nullable().optional(),
  visibility:  z.enum(FAQ_VISIBILITY_VALUES as [string, ...string[]], { message: '公開範囲を選択してください' }),
  isPublished: z.boolean().optional(),
})

export const faqCategoryInputSchema = z.object({
  name:      z.string().trim().min(1, 'カテゴリー名は必須です').max(60),
  color:     z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'カラーコードの形式が正しくありません').optional(),
  isActive:  z.boolean().optional(),
})

export const reorderSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, '並び順のIDが必要です').max(500),
})

export const queryStatusSchema = z.object({
  status: z.enum(KNOWLEDGE_QUERY_STATUS_VALUES as [string, ...string[]], { message: '対応状況を選択してください' }),
})

export const chatAskSchema = z.object({
  question: z.string().trim().min(1, '質問を入力してください').max(2000),
})

export const knowledgeDocumentCreateSchema = z.object({
  fileUrl:  z.string().trim().url('アップロードURLが不正です'),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(100),
  fileSize: z.number().int().positive(),
  title:      z.string().trim().max(200).optional(),
  visibility: z.enum(FAQ_VISIBILITY_VALUES as [string, ...string[]]).optional(),
})

export const knowledgeDocumentUpdateSchema = z.object({
  title:      z.string().trim().min(1, 'タイトルは必須です').max(200).optional(),
  visibility: z.enum(FAQ_VISIBILITY_VALUES as [string, ...string[]], { message: '公開範囲を選択してください' }).optional(),
})
