/**
 * 身分証明証のアップロード（クライアント側の共通処理）。
 *
 * スマホで撮った身分証の写真は 5〜10MB になることがあり、原本のまま送ると
 * Vercel のリクエスト本体の上限（約4.5MB）を超えて 413 で弾かれていた。
 * 413 は関数に届く前に返るため本文が JSON ではなく、画面側の `res.json()` が失敗して
 * 「アップロード中…」のまま止まる事故になっていた（売買契約の身分証確認・マイページ）。
 *
 * ここで
 *   1. 送る前に縮小・圧縮する（OCR で小さな文字を読めるよう、長辺は通常の写真より大きめに残す）
 *   2. 失敗は必ず { ok:false, error } で返す（例外・非JSON・413・通信断を含む）
 * の2点を保証する。身分証のアップロードは必ずこれを通すこと。
 */
import { compressImageIfNeeded } from '@/lib/image-utils'

/** Vercel の上限（4.5MB）に対し、FormData のヘッダ分の余裕を見た送信サイズの上限 */
const MAX_SEND_BYTES = 4 * 1024 * 1024

/** 身分証の画像を送信用に整える（HEIC→JPEG、長辺2400px・高画質で圧縮。PDF はそのまま） */
export async function prepareIdDocumentFile(file: File): Promise<File> {
  return compressImageIfNeeded(file, { maxDimension: 2400, quality: 0.88, skipIfSmallerThan: 1024 * 1024 })
}

export type IdDocumentUploadResult =
  | { ok: true; data: any }
  | { ok: false; error: string }

/**
 * 身分証（表面 or 裏面）を圧縮してから送る。
 * @param endpoint `/api/users/{id}/id-document` または `/api/users/{id}/id-document/back`
 * @param fields   file 以外のフォーム項目（documentType など）
 */
export async function uploadIdDocument(
  endpoint: string,
  file: File,
  fields: Record<string, string> = {},
): Promise<IdDocumentUploadResult> {
  let prepared: File
  try {
    prepared = await prepareIdDocumentFile(file)
  } catch {
    prepared = file
  }
  if (prepared.size > MAX_SEND_BYTES) {
    return {
      ok: false,
      error: prepared.type === 'application/pdf'
        ? 'PDFのサイズが大きすぎます（4MBまで）。写真で撮影してアップロードしてください'
        : '画像のサイズが大きすぎます。撮り直すか、別の画像を選択してください',
    }
  }

  const fd = new FormData()
  fd.append('file', prepared)
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)

  try {
    const res = await fetch(endpoint, { method: 'POST', body: fd })
    // 413 などはサーバー（関数）に届く前に返るので本文が JSON とは限らない
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      if (res.status === 413) return { ok: false, error: '画像のサイズが大きすぎます。撮り直すか、別の画像を選択してください' }
      return { ok: false, error: data?.error || `アップロードに失敗しました（${res.status}）` }
    }
    return { ok: true, data: data ?? {} }
  } catch {
    return { ok: false, error: '通信に失敗しました。電波の良い場所でもう一度お試しください' }
  }
}
