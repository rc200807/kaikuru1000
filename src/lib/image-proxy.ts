import { NextRequest, NextResponse } from 'next/server'
import { thumbUrlFor } from '@/lib/image-url'

/**
 * Blob 上の画像を認証プロキシ経由で返す共通処理。
 *
 * `?thumb=1` が付いていれば、保存時に一緒に作ったサムネイル
 * （`<本体>_thumb.webp`）を返す。一覧・グリッドでの転送量が1/10以下になる。
 * サムネが無い（WebP化する前に保存された）画像は本体にフォールバックするので、
 * 呼び出し側は常に `?thumb=1` を付けてよい。
 */
export async function serveImageFromBlob(
  request: NextRequest,
  blobUrl: string,
): Promise<NextResponse> {
  // 過去に「編集フォームがプロキシURLをそのまま実URLとして保存してしまう」不具合があり、
  // DBに `/api/.../images/0` のような自分自身へのパスが実URLとして混入したレコードが存在する。
  // これをローカルファイル扱いでリダイレクトすると自分自身に戻り続けて無限リダイレクトになる
  // （ブラウザには壊れた画像として延々ぶら下がる）ため、先に検知して404にする
  if (blobUrl.startsWith('/api/')) {
    return NextResponse.json({ error: '画像データが破損しています。再アップロードしてください' }, { status: 404 })
  }

  // ローカル開発（/uploads/...）: 静的ファイルにリダイレクト
  if (!blobUrl.startsWith('https://')) {
    return NextResponse.redirect(new URL(blobUrl, request.url))
  }

  const wantThumb = request.nextUrl.searchParams.get('thumb') === '1'
  const target = wantThumb ? thumbUrlFor(blobUrl) : blobUrl

  try {
    let res = await fetch(target)
    // サムネが存在しない古い画像は本体を返す
    if (!res.ok && target !== blobUrl) res = await fetch(blobUrl)
    if (!res.ok) return NextResponse.json({ error: '画像が見つかりません' }, { status: 404 })

    return new NextResponse(res.body, {
      headers: {
        'Content-Type': res.headers.get('content-type') || 'image/jpeg',
        // 画像の中身は差し替わらない（URLに時刻が入る）ので、ブラウザに1日持たせる
        'Cache-Control': 'private, max-age=86400',
        'Content-Disposition': 'inline',
      },
    })
  } catch {
    return NextResponse.json({ error: '画像の取得に失敗しました' }, { status: 500 })
  }
}
