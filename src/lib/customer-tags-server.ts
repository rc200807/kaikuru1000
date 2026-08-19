// 顧客タグのDBアクセス（サーバー専用）。正規化ルール等は customer-tags.ts を参照。

import { prisma } from '@/lib/prisma'
import { resolveFormCustomerTag, type CustomerTagView, type TaggableForm } from '@/lib/customer-tags'

/**
 * フォーム回答から作成・紐付けされた顧客にタグを付ける。
 * 同じタグが既にある場合は出所だけ更新する（unique([userId, label]) 前提）。
 * 回答の保存自体は止めたくないので、失敗しても例外は投げない。
 */
export async function applyFormCustomerTag(form: TaggableForm, userId: string): Promise<void> {
  const label = resolveFormCustomerTag(form)
  if (!label) return
  try {
    await prisma.customerTag.upsert({
      where: { userId_label: { userId, label } },
      update: { source: 'form', formId: form.id },
      create: { userId, label, source: 'form', formId: form.id },
    })
  } catch (err: any) {
    console.error('[CustomerTag] apply failed:', err?.message)
  }
}

/** 顧客一覧用: 対象ユーザーIDのタグを1クエリでまとめて取得する（N+1回避） */
export async function getCustomerTags(userIds: string[]): Promise<Record<string, CustomerTagView[]>> {
  if (userIds.length === 0) return {}
  const rows = await prisma.customerTag.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, userId: true, label: true, source: true, formId: true },
    orderBy: { createdAt: 'asc' },
  })
  const map: Record<string, CustomerTagView[]> = {}
  for (const r of rows) {
    ;(map[r.userId] ??= []).push({ id: r.id, label: r.label, source: r.source, formId: r.formId })
  }
  return map
}
