/**
 * AES-256-GCM による機密データの暗号化・復号
 * SMTPパスワード・Google OAuthトークンなどの保護に使用
 *
 * 形式: "ivHex:authTagHex:ciphertextHex"
 */

import crypto from 'crypto'

function getDerivedKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? 'kaikuru-default-enc-key-change-in-prod!!'
  // SHA-256 で 32バイトのキーを導出
  return crypto.createHash('sha256').update(raw).digest()
}

/**
 * 平文を暗号化して "iv:tag:ciphertext" 形式の文字列を返す
 */
export function encrypt(plaintext: string): string {
  const key = getDerivedKey()
  const iv = crypto.randomBytes(12) // GCM 推奨: 96ビット
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag() // 認証タグ: 改ざん検知に使用

  return [
    iv.toString('hex'),
    tag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':')
}

/**
 * 暗号化文字列を復号する
 * 既存の平文データにも対応（移行期間フォールバック）
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return ''

  const parts = ciphertext.split(':')
  // 3パーツに分かれていない → 平文のまま返す（既存データ互換）
  if (parts.length !== 3) return ciphertext

  try {
    const key = getDerivedKey()
    const iv        = Buffer.from(parts[0], 'hex')
    const tag       = Buffer.from(parts[1], 'hex')
    const encrypted = Buffer.from(parts[2], 'hex')

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)

    return (
      decipher.update(encrypted).toString('utf8') +
      decipher.final('utf8')
    )
  } catch {
    // 復号失敗: 平文として返す（フォールバック）
    return ciphertext
  }
}

/**
 * 値が暗号化形式かどうかを確認
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':')
  return (
    parts.length === 3 &&
    /^[0-9a-f]+$/i.test(parts[0]) &&
    /^[0-9a-f]+$/i.test(parts[1]) &&
    /^[0-9a-f]+$/i.test(parts[2])
  )
}
