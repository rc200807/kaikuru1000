/** 知恵袋のカテゴリ（質問投稿時に必須選択。絞り込みに使用）。アイコンは ChiebukuroCategoryIcon で描画する。 */
export const CHIEBUKURO_CATEGORIES: { key: string }[] = [
  { key: '買取・査定' },
  { key: '接客・営業' },
  { key: 'システム・操作' },
  { key: '経理・事務' },
  { key: '集客・広告' },
  { key: '商品知識' },
  { key: 'その他' },
]

export const CATEGORY_KEYS = CHIEBUKURO_CATEGORIES.map((c) => c.key)

/** お知らせのクイックリアクション絵文字 */
export const ANNOUNCEMENT_EMOJIS = ['👍', '🎉', '❤️', '😮', '🙏']

/** 質問へのリアクション（気になる 等） */
export const QUESTION_EMOJIS = ['👀', '🤔', '🙌']
/** 回答へのリアクション（役に立った 等） */
export const ANSWER_EMOJIS = ['👍', '🙏', '🎯']
