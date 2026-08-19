// 顧客タグの共通定義（クライアント・サーバー両方から import する。Prisma には依存させない）。
//
// フォーム回答から顧客が作られた（または既存顧客に紐付いた）ときの自動付与と、
// 管理ポータルでの手動付与・一覧表示で同じ正規化ルールを使う。
// DBアクセスを伴う処理は customer-tags-server.ts 側にある。

import { formAdminLabel } from '@/lib/forms/types'

export const TAG_MAX_LENGTH = 40

export type CustomerTagSource = 'form' | 'manual'

export type CustomerTagView = {
  id: string
  label: string
  source: string
  formId: string | null
}

/**
 * タグ名を正規化する。改行・タブ・連続空白を1つにまとめ、前後の空白を落とし、長すぎる場合は切り詰める。
 * 空文字になる場合は null（＝タグとして扱わない）。
 */
export function normalizeTagLabel(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const cleaned = raw.replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return null
  return cleaned.slice(0, TAG_MAX_LENGTH)
}

export type TaggableForm = {
  id: string
  title: string
  internalName: string | null
  customerTagEnabled: boolean
  customerTag: string | null
}

/** フォームの設定から実際に付けるタグ名を決める（未設定なら管理用の名前／公開タイトル） */
export function resolveFormCustomerTag(form: TaggableForm): string | null {
  if (!form.customerTagEnabled) return null
  return normalizeTagLabel(form.customerTag) ?? normalizeTagLabel(formAdminLabel(form))
}
