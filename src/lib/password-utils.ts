import crypto from 'crypto'

/** 安全なランダムパスワードを生成（12文字、英大小+数字+記号、各種1文字以上保証） */
export function generateSecurePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const digits = '23456789'
  const symbols = '!@#$%&*'
  const all = upper + lower + digits + symbols

  // 各種1文字ずつ保証
  const required = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    digits[crypto.randomInt(digits.length)],
    symbols[crypto.randomInt(symbols.length)],
  ]
  const rest = Array.from({ length: 8 }, () => all[crypto.randomInt(all.length)])
  const chars = [...required, ...rest]
  // Fisher-Yates シャッフル
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}
