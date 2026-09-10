/**
 * 画像アップロードの共通処理。
 *
 * これまで各画面が「HEIC変換だけして原本を1枚ずつ直列に POST する」というコードを
 * コピペで持っており、iPhone の 4MB 写真がそのまま日本→米国東部（iad1）へ流れていた。
 * 実測で 1枚 4〜16 秒、2枚なら直列で倍かかる。
 *
 * ここを1箇所に集約し、
 *   1. compressImageIfNeeded() で WebP・長辺2000px（≒200〜300KB）へ落としてから送る
 *   2. 可能なエンドポイントでは同時に送る
 * の2点で待ち時間を削る。サーバー側の saveImage() も最終的に WebP へ正規化するので、
 * 画質は従来と実質変わらない（サムネ生成・EXIF除去もサーバー側のまま維持される）。
 */
import { compressImageIfNeeded, type CompressOptions } from '@/lib/image-utils'

export type ImageUploadResult = {
  /** 成功したぶんのURL（**入力順**。レスポンスに url を含まないエンドポイントでは空配列） */
  urls: string[]
  /** 各ファイルのレスポンス本文（入力順。失敗は null） */
  bodies: (any | null)[]
  /** 失敗した枚数 */
  failed: number
  /** 最初に取れたエラーメッセージ（サーバーが error を返した場合） */
  error: string | null
}

export type UploadImagesOptions = {
  /** FormData のフィールド名。既定 'file' */
  fieldName?: string
  /**
   * 同時実行数。既定は全枚数を同時に送る。
   *
   * **サーバー側が「現在の配列を読む → push → 書き戻す」をするエンドポイントでは必ず 1 を指定すること。**
   * 同時に投げると read-modify-write が競合して写真が失われる。
   * 該当: `/api/deals/[id]/contract-images`、`/api/akiya-cases/[id]/photos`
   * （`/api/purchase-items/images` などは Blob に書いて URL を返すだけなので同時実行して安全）
   */
  concurrency?: number
  /** 圧縮パラメータ（既定: 長辺2000px / q0.82 / 300KB以下は素通し） */
  compress?: CompressOptions
  signal?: AbortSignal
}

type Outcome = { body: any | null; error: string | null }

async function uploadOne(
  file: File,
  endpoint: string,
  fieldName: string,
  compress: CompressOptions | undefined,
  signal: AbortSignal | undefined,
): Promise<Outcome> {
  try {
    const prepared = await compressImageIfNeeded(file, compress)
    const fd = new FormData()
    fd.append(fieldName, prepared)
    const res = await fetch(endpoint, { method: 'POST', body: fd, signal })
    const body = await res.json().catch(() => null)
    if (!res.ok) return { body: null, error: body?.error ?? 'アップロードに失敗しました' }
    return { body, error: null }
  } catch {
    return { body: null, error: 'アップロードに失敗しました' }
  }
}

/**
 * 画像を圧縮してからアップロードする。
 * 1枚失敗しても他は落とさず、`failed` と `error` で呼び出し側に伝える。
 */
export async function uploadImagesCompressed(
  files: File[],
  endpoint: string,
  options: UploadImagesOptions = {},
): Promise<ImageUploadResult> {
  const { fieldName = 'file', concurrency, compress, signal } = options
  // 出力は必ず入力順にそろえる（写真の並び順がユーザーの意図なので、完了順にしてはいけない）
  const outcomes: Outcome[] = new Array(files.length)

  const limit = Math.max(1, Math.min(concurrency ?? files.length, files.length || 1))
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, files.length) }, async () => {
      for (;;) {
        const i = next++
        if (i >= files.length) return
        outcomes[i] = await uploadOne(files[i], endpoint, fieldName, compress, signal)
      }
    }),
  )

  const urls: string[] = []
  const bodies: (any | null)[] = []
  let failed = 0
  let error: string | null = null
  for (const o of outcomes) {
    bodies.push(o?.body ?? null)
    if (!o || o.error) {
      failed++
      if (!error) error = o?.error ?? 'アップロードに失敗しました'
      continue
    }
    if (typeof o.body?.url === 'string') urls.push(o.body.url)
  }
  return { urls, bodies, failed, error }
}
