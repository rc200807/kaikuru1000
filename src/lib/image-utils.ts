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
