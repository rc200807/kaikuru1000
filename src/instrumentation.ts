// Next.js instrumentation: サーバー側の未捕捉エラーを横断的にアクセスログへ記録する。
// 各APIで try/catch して JSON 500 を返しているケースは捕捉されないが、
// 想定外のスロー（クラッシュ）はすべてここで検出できる。
export async function onRequestError(
  err: unknown,
  request: { path?: string; method?: string },
  context: { routePath?: string; routeType?: string }
) {
  // prisma は Node ランタイムでのみ利用可能
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  try {
    const { prisma } = await import('@/lib/prisma')
    const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    const where = `${request?.method ?? ''} ${request?.path ?? context?.routePath ?? ''}`.trim()
    await prisma.accessLog.create({
      data: {
        userType: 'error',
        action: `エラー: ${where} — ${message}`.slice(0, 500),
      },
    })
  } catch {
    // ログ記録自体の失敗は握り潰す（無限ループ防止）
  }
}
