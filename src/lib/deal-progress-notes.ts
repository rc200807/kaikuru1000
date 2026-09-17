/**
 * 案件の対応状況メモ（店舗が案件詳細から自由記入で残す記録）。
 *
 * 案件詳細GET（`/api/deals/[id]`）が自分のレスポンスに畳み込むためにここへ切り出した。
 * 専用エンドポイント（`/api/deals/[id]/progress-notes`）は追加・編集・削除のあとの再取得に使う。
 *
 * 並びは新しい順（一覧は最新が上）。進捗タイムラインは画面側で時系列に並べ直す。
 */
import { prisma } from '@/lib/prisma'

/** 入力の上限（DB は TEXT だが、タイムラインの1行に収まる長さで頭打ちにする） */
export const NOTE_TITLE_MAX = 100
export const NOTE_BODY_MAX = 5000

export type DealProgressNoteInput = { title: string; body: string }

/**
 * 入力の正規化。タイトル必須・本文任意（本文だけ空の「見出しメモ」も許す）。
 * 戻り値が string のときはエラーメッセージ。
 */
export function normalizeNoteInput(body: any): DealProgressNoteInput | string {
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const text = typeof body?.body === 'string' ? body.body.trim() : ''
  if (!title) return 'タイトルを入力してください'
  if (title.length > NOTE_TITLE_MAX) return `タイトルは${NOTE_TITLE_MAX}文字以内で入力してください`
  if (text.length > NOTE_BODY_MAX) return `内容は${NOTE_BODY_MAX}文字以内で入力してください`
  return { title, body: text }
}

export const PROGRESS_NOTE_SELECT = {
  id: true, title: true, body: true,
  createdByType: true, createdByName: true,
  createdAt: true, updatedAt: true,
} as const

export function serializeProgressNote(n: {
  id: string
  title: string
  body: string
  createdByType: string | null
  createdByName: string | null
  createdAt: Date
  updatedAt: Date
}) {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    createdByType: n.createdByType,
    createdByName: n.createdByName,
    createdAt: n.createdAt,
    // 記入後に直したものは画面で「編集済み」と分かるようにする（秒単位のズレは無視）
    updatedAt: n.updatedAt,
    edited: Math.abs(n.updatedAt.getTime() - n.createdAt.getTime()) > 2000,
  }
}

export async function loadDealProgressNotes(dealId: string) {
  const notes = await prisma.dealProgressNote.findMany({
    where: { dealId },
    select: PROGRESS_NOTE_SELECT,
    orderBy: { createdAt: 'desc' },
  })
  return notes.map(serializeProgressNote)
}
