/**
 * 画像ユーティリティ
 * HEIC/HEIF → JPEG変換、プレビュー生成
 */

/**
 * HEIC/HEIFファイルをJPEGに変換する
 * 通常の画像はそのまま返す
 */
export async function convertToJpegIfNeeded(file: File): Promise<File> {
  const isHeic = file.type === 'image/heic' || file.type === 'image/heif' ||
    file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')

  if (!isHeic) return file

  try {
    const heic2any = (await import('heic2any')).default
    const blob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.85,
    })
    const resultBlob = Array.isArray(blob) ? blob[0] : blob
    const newName = file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg')
    return new File([resultBlob], newName, { type: 'image/jpeg' })
  } catch (e) {
    console.error('HEIC conversion failed:', e)
    return file // 変換失敗時は元ファイルを返す
  }
}

/**
 * ファイルからプレビューURLを生成する
 * HEICの場合は変換後のURLを返す
 */
export async function createPreviewUrl(file: File): Promise<string> {
  const converted = await convertToJpegIfNeeded(file)
  return URL.createObjectURL(converted)
}

/**
 * FormDataに画像を追加する（HEIC変換付き）
 */
export async function appendImageToFormData(
  formData: FormData,
  fieldName: string,
  file: File
): Promise<void> {
  const converted = await convertToJpegIfNeeded(file)
  formData.append(fieldName, converted)
}

type CompressOptions = {
  /** 長辺の最大ピクセル数。これ以下なら拡大しない */
  maxDimension?: number
  /** JPEG 品質 (0-1) */
  quality?: number
  /** これより小さければ何もしない（バイト） */
  skipIfSmallerThan?: number
}

/**
 * 画像をクライアント側でリサイズ・再エンコードし、Vercel のリクエスト上限
 * (4.5MB) に収まるサイズに圧縮する。HEIC は先に JPEG へ変換する。
 *
 * - 既に十分小さい（既定 1.5MB 以下）場合はそのまま返す
 * - JPEG/PNG/WEBP/HEIC 画像が対象。それ以外（GIF 等）はそのまま返す
 * - 失敗した場合は元ファイルを返す（呼び出し側でハンドル）
 */
export async function compressImageIfNeeded(
  file: File,
  options: CompressOptions = {}
): Promise<File> {
  const { maxDimension = 2400, quality = 0.85, skipIfSmallerThan = 1.5 * 1024 * 1024 } = options

  // HEIC は JPEG に変換
  const input = await convertToJpegIfNeeded(file)

  // 元から十分小さければそのまま
  if (input.size <= skipIfSmallerThan) return input
  // 画像でなければ手を出さない
  if (!input.type.startsWith('image/')) return input
  // ブラウザ外（SSR）では何もしない
  if (typeof window === 'undefined' || typeof document === 'undefined') return input

  try {
    const blob: Blob = await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const ratio = Math.min(maxDimension / img.width, maxDimension / img.height, 1)
        const width = Math.round(img.width * ratio)
        const height = Math.round(img.height * ratio)
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('canvas ctx unavailable')); return }
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (b) => b ? resolve(b) : reject(new Error('canvas.toBlob returned null')),
          'image/jpeg',
          quality,
        )
      }
      img.onerror = () => reject(new Error('image decode failed'))
      img.src = URL.createObjectURL(input)
    })
    const newName = input.name.replace(/\.[^.]+$/, '.jpg') || 'image.jpg'
    return new File([blob], newName, { type: 'image/jpeg' })
  } catch (e) {
    console.warn('compressImageIfNeeded failed, falling back to original:', e)
    return input
  }
}
