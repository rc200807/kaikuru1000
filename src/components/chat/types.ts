// 本部⇄店舗チャットのクライアント側型・設定

export type ChatAttachment = {
  url: string
  name: string
  mimeType: string
  size: number
  kind: 'image' | 'file'
}

export type ChatReaction = {
  emoji: string
  count: number
  actors: { type: string; name: string }[]
  mine: boolean
}

export type ChatMessage = {
  id: string
  parentId: string | null
  authorType: 'admin' | 'store'
  authorName: string
  authorAvatar: string | null
  body: string
  attachments: ChatAttachment[]
  isDeleted: boolean
  isEdited: boolean
  createdAt: string
  mine: boolean
  reactions: ChatReaction[]
  replyCount: number
  replies?: ChatMessage[]
}

/** メンション候補（本部管理者 or 店舗メンバー） */
export type Participant = {
  type: 'admin' | 'store'
  id: string
  name: string
  avatar: string | null
}

/** チャットAPIのエンドポイント群（店舗/本部で差し替え） */
export type ChatEndpoints = {
  /** GET 一覧 / POST 送信 */
  messages: string
  /** PATCH 編集 / DELETE 削除 */
  message: (id: string) => string
  /** POST リアクションのトグル */
  reactions: (id: string) => string
  /** POST 既読化 */
  read: string
  /** POST 添付アップロード */
  attachments: string
  /** GET メンション候補（{ admins, members }） */
  participants: string
}

export const QUICK_EMOJIS = ['👍', '✅', '🙏', '🎉', '❤️', '😄', '👀']
