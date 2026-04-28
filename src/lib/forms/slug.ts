import { randomBytes } from 'crypto'

/** URL-safe な短いランダム slug を生成（既定10文字） */
export function generateSlug(length = 10): string {
  // base64url から記号を除いた英数字のみ
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789' // 小文字のみ（normalizeCustomSlug と整合させる）。紛らわしい0/o/1/l を除外
  const bytes = randomBytes(length)
  let out = ''
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length]
  }
  return out
}

/** ユーザー入力の slug を正規化＋検証 */
export function normalizeCustomSlug(input: string): string | null {
  const trimmed = input.trim().toLowerCase().replace(/\s+/g, '-')
  if (!/^[a-z0-9][a-z0-9-]{1,49}$/.test(trimmed)) return null
  return trimmed
}
