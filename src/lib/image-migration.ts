import path from 'path'
import { prisma } from '@/lib/prisma'
import { measureWebpSize, saveImage } from '@/lib/image-server'

/**
 * すでに保存されている画像を WebP に置き換えるバッチ。
 *
 * 2026-08-25 の変更で「新しくアップロードされる画像」は WebP＋サムネで保存されるようになったが、
 * それ以前に保存された画像は原本（JPEG/PNG・スマホ解像度のまま）で配信され続ける。
 * ここで既存分を作り直す。
 *
 * 方針:
 *  - 元ファイルは消さない（新URLに差し替えるだけ）。問題が出たらDBを戻せば元に戻る
 *  - 何度実行しても安全（すでに .webp のURLは触らない）
 *  - 1回の呼び出しで少数だけ処理し、カーソルを返す（関数の実行時間制限に収める）
 *  - 身分証・本人確認書類は対象外。OCRの再実行と絡むため、アップロード側と方針を揃える
 */

export type ImageFieldTarget = {
  /** 進捗の再開に使う識別子 */
  key: string
  label: string
  /** prisma のモデル名（camelCase） */
  model: string
  field: string
  kind: 'single' | 'jsonArray'
  /** 一覧サムネを作らない場合（アバターなど小さい画像）に上書きする */
  maxDimension?: number
  thumbDimension?: number
}

/** 変換対象。上から順に処理する */
export const IMAGE_FIELD_TARGETS: ImageFieldTarget[] = [
  { key: 'purchaseMemo.imageUrls', label: '買取相談メモの写真', model: 'purchaseMemo', field: 'imageUrls', kind: 'jsonArray' },
  { key: 'deliveryShipment.imageUrls', label: '宅配送付（箱の中）', model: 'deliveryShipment', field: 'imageUrls', kind: 'jsonArray' },
  { key: 'deliveryShipment.trackingImageUrls', label: '宅配送付（伝票）', model: 'deliveryShipment', field: 'trackingImageUrls', kind: 'jsonArray' },
  { key: 'deal.paperContractImages', label: '紙の売買契約書の写真', model: 'deal', field: 'paperContractImages', kind: 'jsonArray' },
  { key: 'purchaseItem.imageUrls', label: '買取品目の写真', model: 'purchaseItem', field: 'imageUrls', kind: 'jsonArray' },
  { key: 'inventoryItem.imageUrls', label: '在庫の写真', model: 'inventoryItem', field: 'imageUrls', kind: 'jsonArray' },
  { key: 'communityThread.imageUrls', label: '知恵袋の投稿画像', model: 'communityThread', field: 'imageUrls', kind: 'jsonArray' },
  { key: 'akiyaCase.photoUrls', label: '空き家案件の物件写真', model: 'akiyaCase', field: 'photoUrls', kind: 'jsonArray' },
  { key: 'akiyaRecordItem.photoUrls', label: '空き家の作業記録写真', model: 'akiyaRecordItem', field: 'photoUrls', kind: 'jsonArray' },
  { key: 'bugReport.imageUrls', label: '不具合報告の添付', model: 'bugReport', field: 'imageUrls', kind: 'jsonArray' },
  { key: 'bugReportComment.imageUrls', label: '不具合報告コメントの添付', model: 'bugReportComment', field: 'imageUrls', kind: 'jsonArray' },
  { key: 'product.imageUrl', label: '備品の商品画像', model: 'product', field: 'imageUrl', kind: 'single' },
  { key: 'trainingVideo.thumbnailUrl', label: '研修動画のサムネイル', model: 'trainingVideo', field: 'thumbnailUrl', kind: 'single' },
  { key: 'store.avatar', label: '店舗アイコン', model: 'store', field: 'avatar', kind: 'single', maxDimension: 512, thumbDimension: 128 },
  { key: 'storeMember.avatar', label: 'メンバーアイコン', model: 'storeMember', field: 'avatar', kind: 'single', maxDimension: 512, thumbDimension: 128 },
  { key: 'admin.avatar', label: '管理者アイコン', model: 'admin', field: 'avatar', kind: 'single', maxDimension: 512, thumbDimension: 128 },
]

/** 変換する必要があるURLか（すでにWebP・空・外部URLは対象外） */
export function needsConversion(url: unknown): url is string {
  if (typeof url !== 'string' || !url) return false
  const p = url.split('?')[0]
  if (p.endsWith('.webp')) return false
  // 自分たちが保存したもの（Vercel Blob もしくはローカルの /uploads）だけを対象にする
  return p.includes('.public.blob.vercel-storage.com/') || p.startsWith('/uploads/')
}

/** 画像のバイト列を取得する（Blob URL / ローカル /uploads の両対応） */
async function readImageBytes(url: string): Promise<Buffer | null> {
  try {
    if (url.startsWith('/uploads/')) {
      const { readFile } = await import('fs/promises')
      return await readFile(path.join(process.cwd(), 'public', url))
    }
    const res = await fetch(url)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

/** URL から拡張子を除いた保存パスを作る（例: .../purchase-memos/abc_1.jpg → purchase-memos/abc_1） */
function basePathFromUrl(url: string): string {
  const clean = url.split('?')[0]
  const withoutOrigin = clean.startsWith('/uploads/')
    ? clean.slice('/uploads/'.length)
    : clean.replace(/^https?:\/\/[^/]+\//, '')
  return withoutOrigin.replace(/\.[^./]+$/, '')
}

export type ConvertResult = {
  url: string
  originalBytes: number
  newBytes: number
}

/**
 * 1枚のURLを WebP に作り直して新しいURLを返す。失敗したら null。
 * dryRun のときは保存せず、変換後のサイズだけ測る（ストレージを汚さない）。
 */
async function convertOne(url: string, target: ImageFieldTarget, dryRun: boolean): Promise<ConvertResult | null> {
  const buf = await readImageBytes(url)
  if (!buf) return null
  try {
    if (dryRun) {
      const measured = await measureWebpSize(buf, { maxDimension: target.maxDimension })
      if (!measured) return null
      return { url, originalBytes: buf.byteLength, newBytes: measured.bytes }
    }
    const saved = await saveImage(buf, basePathFromUrl(url), guessContentType(url), {
      maxDimension: target.maxDimension,
      thumbDimension: target.thumbDimension,
    })
    return { url: saved.url, originalBytes: buf.byteLength, newBytes: saved.bytes }
  } catch {
    return null
  }
}

function guessContentType(url: string): string {
  const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase()
  if (ext === 'png') return 'image/png'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'heic' || ext === 'heif') return 'image/heic'
  return 'image/jpeg'
}

export type BatchResult = {
  key: string
  label: string
  /** 次に処理を再開するレコードID。null ならこの対象は完了 */
  nextCursor: string | null
  scanned: number
  updatedRecords: number
  convertedImages: number
  failedImages: number
  originalBytes: number
  newBytes: number
}

/**
 * 対象1つぶんを batchSize レコードだけ処理する。
 * @param cursor 前回返された nextCursor（最初は null）
 */
export async function optimizeImageBatch(
  target: ImageFieldTarget,
  cursor: string | null,
  batchSize: number,
  dryRun: boolean,
): Promise<BatchResult> {
  // モデル名は固定のリストからしか来ないので動的アクセスで問題ない
  const delegate = (prisma as unknown as Record<string, {
    findMany: (args: unknown) => Promise<Record<string, unknown>[]>
    update: (args: unknown) => Promise<unknown>
  }>)[target.model]

  const rows = await delegate.findMany({
    where: cursor ? { id: { gt: cursor } } : {},
    select: { id: true, [target.field]: true },
    orderBy: { id: 'asc' },
    take: batchSize,
  })

  const result: BatchResult = {
    key: target.key,
    label: target.label,
    nextCursor: rows.length === batchSize ? String(rows[rows.length - 1].id) : null,
    scanned: rows.length,
    updatedRecords: 0,
    convertedImages: 0,
    failedImages: 0,
    originalBytes: 0,
    newBytes: 0,
  }

  for (const row of rows) {
    const raw = row[target.field]
    const id = String(row.id)

    if (target.kind === 'single') {
      if (!needsConversion(raw)) continue
      const converted = await convertOne(raw, target, dryRun)
      if (!converted) { result.failedImages++; continue }
      result.convertedImages++
      result.originalBytes += converted.originalBytes
      result.newBytes += converted.newBytes
      if (!dryRun) {
        await delegate.update({ where: { id }, data: { [target.field]: converted.url } })
      }
      result.updatedRecords++
      continue
    }

    // JSON配列
    let list: unknown[] = []
    try { list = JSON.parse((raw as string) || '[]') } catch { continue }
    if (!Array.isArray(list) || list.length === 0) continue
    if (!list.some(needsConversion)) continue

    const next: unknown[] = []
    let changed = false
    for (const item of list) {
      if (!needsConversion(item)) { next.push(item); continue }
      const converted = await convertOne(item, target, dryRun)
      if (!converted) { result.failedImages++; next.push(item); continue }
      result.convertedImages++
      result.originalBytes += converted.originalBytes
      result.newBytes += converted.newBytes
      next.push(converted.url)
      changed = true
    }
    if (changed) {
      if (!dryRun) {
        await delegate.update({ where: { id }, data: { [target.field]: JSON.stringify(next) } })
      }
      result.updatedRecords++
    }
  }

  return result
}
