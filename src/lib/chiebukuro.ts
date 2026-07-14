/** 知恵袋のカテゴリ（質問投稿時に必須選択。絞り込みに使用） */
export const CHIEBUKURO_CATEGORIES: { key: string; icon: string }[] = [
  { key: '買取・査定', icon: '💰' },
  { key: '接客・営業', icon: '🤝' },
  { key: 'システム・操作', icon: '💻' },
  { key: '経理・事務', icon: '📊' },
  { key: '集客・広告', icon: '📣' },
  { key: '商品知識', icon: '📚' },
  { key: 'その他', icon: '❓' },
]

export const CATEGORY_KEYS = CHIEBUKURO_CATEGORIES.map((c) => c.key)

export function categoryIcon(key: string): string {
  return CHIEBUKURO_CATEGORIES.find((c) => c.key === key)?.icon ?? '❓'
}

/** お知らせのクイックリアクション絵文字 */
export const ANNOUNCEMENT_EMOJIS = ['👍', '🎉', '❤️', '😮', '🙏']

/** 質問へのリアクション（気になる 等） */
export const QUESTION_EMOJIS = ['👀', '🤔', '🙌']
/** 回答へのリアクション（役に立った 等） */
export const ANSWER_EMOJIS = ['👍', '🙏', '🎯']
