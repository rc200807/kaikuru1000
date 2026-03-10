/**
 * ファイルアップロードのセキュリティ検証
 * - Magic Number（ファイルヘッダー）で実際のファイル形式を確認
 * - MIMEタイプ偽装やダブル拡張子攻撃を防ぐ
 */

// ファイル形式ごとの Magic Number（先頭バイト列）
const FILE_SIGNATURES: Record<string, number[][]> = {
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png':  [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF (+ WEBP マーク確認)
  'image/gif':  [[0x47, 0x49, 0x46, 0x38]],  // GIF8
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
}

// MIMEタイプ → 安全な拡張子マッピング（ファイル名に依存しない）
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
  'image/gif':  'gif',
  'application/pdf': 'pdf',
}

/**
 * ファイルの Magic Number を検証して実際の形式を確認
 * MIMEタイプが偽装されていても検出できる
 */
export async function validateFileMagicNumber(
  file: File,
  allowedTypes: string[],
): Promise<{ valid: boolean; detectedType?: string; error?: string }> {
  const buffer = Buffer.from(await file.arrayBuffer())

  for (const type of allowedTypes) {
    const signatures = FILE_SIGNATURES[type]
    if (!signatures) continue

    for (const sig of signatures) {
      const matches = sig.every((byte, i) => buffer[i] === byte)
      if (!matches) continue

      // WebP は RIFF ヘッダーの後に "WEBP" マークが必要
      if (type === 'image/webp') {
        const webpMark = buffer.slice(8, 12).toString('ascii')
        if (webpMark !== 'WEBP') continue
      }

      return { valid: true, detectedType: type }
    }
  }

  return {
    valid: false,
    error: '許可されていないファイル形式です。ファイルの内容が拡張子と一致しません。',
  }
}

/**
 * MIMEタイプから安全な拡張子を取得
 * ファイル名（ユーザー入力）に依存せず、MIMEタイプから決定することで
 * ダブル拡張子攻撃（shell.php.jpg など）を防ぐ
 */
export function getSafeExtension(mimeType: string): string {
  return MIME_TO_EXT[mimeType] ?? 'bin'
}

/**
 * 画像ファイルの総合検証（アバター用）
 * - サイズ: 5MB 以下
 * - 形式: JPEG / PNG / WebP のみ
 * - Magic Number でファイル内容を確認
 */
export async function validateAvatarFile(
  file: File,
): Promise<{ valid: boolean; ext?: string; error?: string }> {
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
  const MAX_SIZE = 5 * 1024 * 1024 // 5MB

  if (file.size > MAX_SIZE) {
    return { valid: false, error: 'アイコン画像は5MB以下にしてください' }
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: 'JPEG・PNG・WebP 形式の画像のみアップロードできます' }
  }

  const magicResult = await validateFileMagicNumber(file, ALLOWED_TYPES)
  if (!magicResult.valid) return { valid: false, error: magicResult.error }

  return { valid: true, ext: getSafeExtension(magicResult.detectedType ?? file.type) }
}

/**
 * 身分証ファイルの総合検証
 * - サイズ: 10MB 以下
 * - 形式: JPEG / PNG / WebP / PDF のみ
 * - Magic Number でファイル内容を確認
 */
export async function validateIdDocumentFile(
  file: File,
): Promise<{ valid: boolean; ext?: string; error?: string }> {
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  const MAX_SIZE = 10 * 1024 * 1024 // 10MB

  if (file.size > MAX_SIZE) {
    return { valid: false, error: 'ファイルサイズは10MB以下にしてください' }
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return { valid: false, error: 'JPEG・PNG・WebP・PDF 形式のみアップロードできます' }
  }

  const magicResult = await validateFileMagicNumber(file, ALLOWED_TYPES)
  if (!magicResult.valid) return { valid: false, error: magicResult.error }

  return { valid: true, ext: getSafeExtension(magicResult.detectedType ?? file.type) }
}
