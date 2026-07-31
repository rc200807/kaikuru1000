// ナレッジベース（FAQ）の中央定義。
// 'use client' を付けずサーバー／クライアント両方から参照する（complaint.ts と同じ流儀）。

/** FAQの公開範囲。店舗ポータルは 'all' のみ参照できる */
export const FAQ_VISIBILITIES = [
  { value: 'all',   label: '店舗にも公開', hint: '店舗ポータルのFAQ一覧とAIチャットの両方で使われます' },
  { value: 'admin', label: '管理者のみ',   hint: '管理ポータル内でのみ参照されます。店舗には一切出ません' },
] as const
export type FaqVisibility = typeof FAQ_VISIBILITIES[number]['value']

export const FAQ_VISIBILITY_VALUES = FAQ_VISIBILITIES.map(v => v.value) as readonly string[]

export function faqVisibilityLabel(value: string | null | undefined): string {
  return FAQ_VISIBILITIES.find(v => v.value === value)?.label ?? (value ?? '')
}

export const FAQ_VISIBILITY_COLOR: Record<FaqVisibility, { bg: string; fg: string }> = {
  all:   { bg: 'rgba(74,222,128,0.15)',  fg: '#4ade80' },
  admin: { bg: 'rgba(251,191,36,0.15)',  fg: '#fbbf24' },
}

/** 未回答の質問（KnowledgeQuery）の対応状況 */
export const KNOWLEDGE_QUERY_STATUSES = [
  { value: 'open',     label: '未対応' },
  { value: 'resolved', label: '対応済み' },
  { value: 'ignored',  label: '対応不要' },
] as const
export type KnowledgeQueryStatus = typeof KNOWLEDGE_QUERY_STATUSES[number]['value']

export const KNOWLEDGE_QUERY_STATUS_VALUES = KNOWLEDGE_QUERY_STATUSES.map(s => s.value) as readonly string[]

export function knowledgeQueryStatusLabel(value: string | null | undefined): string {
  return KNOWLEDGE_QUERY_STATUSES.find(s => s.value === value)?.label ?? (value ?? '')
}

/** カテゴリーの色パレット（AnnouncementCategory と同じ選び方） */
export const FAQ_CATEGORY_COLORS = [
  '#6B7280', '#EF4444', '#F59E0B', '#10B981', '#3B82F6',
  '#8B5CF6', '#EC4899', '#14B8A6', '#F97316', '#64748B',
] as const

/** チャットの1メッセージ（KnowledgeChatSession.messages に JSON 配列で保存する） */
export type KnowledgeChatMessage = {
  role: 'user' | 'assistant'
  content: string
  /** 回答の根拠にしたFAQのID（assistant のみ） */
  faqIds?: string[]
  /** ナレッジで回答できたか（assistant のみ） */
  answered?: boolean
  at: string
}

/** 会話が長くなりすぎないよう保存する上限（往復数ではなくメッセージ数） */
export const MAX_STORED_MESSAGES = 40
