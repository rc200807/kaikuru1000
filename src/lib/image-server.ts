import type { Sharp } from 'sharp'
import { uploadFile } from '@/lib/storage'

type SharpFactory = (input: Buffer, opts?: { failOn?: 'none' }) => Sharp

/**
 * sharp はネイティブバイナリ（libvips）に依存するため、実行環境によっては読み込めない。
 * 読み込めなかった場合に画像アップロード自体を落とすと業務が止まるので、
 * その場合は「変換せず原本を保存する」に倒す（遅くなるだけで、機能は動く）。
 */
let sharpFactory: SharpFactory | null | undefined
async function getSharp(): Promise<SharpFactory | null> {
  if (sharpFactory !== undefined) return sharpFactory
  try {
    const mod = await import('sharp')
    sharpFactory = (mod.default ?? mod) as unknown as SharpFactory
  } catch (e) {
    console.error('[image-server] sharp を読み込めませんでした。画像は変換せず原本のまま保存します', e)
    sharpFactory = null
  }
  return sharpFactory
}

/**
 * アップロードされた画像をサーバー側で正規化してから保存する。
 *
 * これまでは受け取ったファイルをそのまま保存していたため、スマホで撮った写真が
 * 3〜5MB のまま保管・配信され、一覧画面を開くたびに数MBを転送していた。
 *
 * ここでやること:
 *  - EXIF の回転情報を実際のピクセルに反映してから EXIF を落とす
 *    （撮影場所などの位置情報が保存物に残らないので、個人情報の観点でも有効）
 *  - 長辺を上限までリサイズ（拡大はしない）
 *  - WebP に再エンコード（JPEG比でおおむね3〜5割小さい）
 *  - 一覧・グリッド用のサムネイルを同時に生成し、`<元の名前>_thumb.webp` で保存する
 *
 * サムネのURLは規約ベースで導出する（DBにサムネ用のカラムを増やさない）。
 * 参照側は src/lib/image-url.ts の thumbUrlFor() を使う。
 */

export type SavedImage = {
  /** 本体（WebP）のURL */
  url: string
  /** サムネイル（WebP）のURL。生成しなかった場合は url と同じ */
  thumbUrl: string
  width: number
  height: number
  /** 保存後のバイト数（本体） */
  bytes: number
  /** 元のバイト数（ログ・効果測定用） */
  originalBytes: number
}

export type SaveImageOptions = {
  /** 本体の長辺上限（既定 2000px） */
  maxDimension?: number
  /** WebP 品質（既定 80） */
  quality?: number
  /** サムネの長辺（既定 400px。0 でサムネを作らない） */
  thumbDimension?: number
}

/** WebP へ変換して保存する対象か（GIF はアニメーションが壊れるので対象外） */
export function isConvertibleImage(contentType: string): boolean {
  return ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/avif', 'image/tiff']
    .includes(contentType.toLowerCase())
}

/**
 * 画像を正規化して保存する。
 * @param buffer   元のバイナリ
 * @param basePath 拡張子を除いた保存パス（例: `purchase-memos/abc_1712345678`）
 * @param contentType 元のMIMEタイプ
 */
export async function saveImage(
  buffer: Buffer,
  basePath: string,
  contentType: string,
  options: SaveImageOptions = {},
): Promise<SavedImage> {
  const { maxDimension = 2000, quality = 80, thumbDimension = 400 } = options
  const originalBytes = buffer.byteLength
  const sharp = await getSharp()

  // 変換対象外（GIF・SVG など）と、sharp が使えない環境では素通しで保存する
  if (!sharp || !isConvertibleImage(contentType)) {
    const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'bin'
    const url = await uploadFile(buffer, `${basePath}.${ext}`, contentType)
    return { url, thumbUrl: url, width: 0, height: 0, bytes: originalBytes, originalBytes }
  }

  const base = sharp(buffer, { failOn: 'none' }).rotate() // rotate() が EXIF Orientation を反映する
  const meta = await base.metadata()

  const main = await base
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true })

  const url = await uploadFile(main.data, `${basePath}.webp`, 'image/webp')

  let thumbUrl = url
  if (thumbDimension > 0) {
    try {
      const thumb = await sharp(buffer, { failOn: 'none' })
        .rotate()
        .resize({ width: thumbDimension, height: thumbDimension, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 70 })
        .toBuffer()
      thumbUrl = await uploadFile(thumb, `${basePath}_thumb.webp`, 'image/webp')
    } catch {
      // サムネ生成に失敗しても本体は保存済みなので、そのまま本体URLを使う
      thumbUrl = url
    }
  }

  console.log(
    `[saveImage] ${basePath}: ${Math.round(originalBytes / 1024)}KB → ${Math.round(main.info.size / 1024)}KB ` +
    `(${meta.width ?? '?'}x${meta.height ?? '?'} → ${main.info.width}x${main.info.height})`,
  )

  return {
    url,
    thumbUrl,
    width: main.info.width,
    height: main.info.height,
    bytes: main.info.size,
    originalBytes,
  }
}

/**
 * 変換後のサイズだけ測る（保存しない）。
 * 既存画像の一括変換を「確認モード」で走らせるときに使う。
 */
export async function measureWebpSize(
  buffer: Buffer,
  options: SaveImageOptions = {},
): Promise<{ bytes: number; width: number; height: number } | null> {
  const { maxDimension = 2000, quality = 80 } = options
  const sharp = await getSharp()
  if (!sharp) return null
  try {
    const out = await sharp(buffer, { failOn: 'none' })
      .rotate()
      .resize({ width: maxDimension, height: maxDimension, fit: 'inside', withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true })
    return { bytes: out.info.size, width: out.info.width, height: out.info.height }
  } catch {
    return null
  }
}

/**
 * sharp（画像変換）が実行環境で使えるか。
 * 使えない場合、アップロードは原本のまま保存され、既存画像の一括変換も何もできない。
 * 運用画面で「効いていないこと」に気づけるようにするための確認用。
 */
export async function isSharpAvailable(): Promise<boolean> {
  const sharp = await getSharp()
  if (!sharp) return false
  try {
    // 1x1 の画像を1枚だけ実際にエンコードして、ネイティブ側まで動くことを確かめる
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    await sharp(png).webp({ quality: 60 }).toBuffer()
    return true
  } catch {
    return false
  }
}
