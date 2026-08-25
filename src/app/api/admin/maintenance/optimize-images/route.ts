import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { recordAccessLog } from '@/lib/access-log'
import { IMAGE_FIELD_TARGETS, optimizeImageBatch } from '@/lib/image-migration'

// 画像の再エンコードはCPUを使うので、1回の呼び出しに余裕を持たせる
export const maxDuration = 60
export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = ['superadmin', 'sysadmin']
const MAX_BATCH = 20

/** 変換対象の一覧（画面の進捗表示用） */
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as { role?: string } | undefined
  if (!session || !user?.role || !ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json({
    targets: IMAGE_FIELD_TARGETS.map(t => ({ key: t.key, label: t.label })),
  })
}

/**
 * 既存画像を WebP に作り直す（1バッチぶん）。
 *
 * 画面側から `{ key, cursor }` を渡して繰り返し呼ぶ。
 * レスポンスの nextCursor が null なら、その対象は完了 → nextKey へ進む。
 * 元ファイルは消さずURLだけ差し替えるので、途中で止めても壊れない。
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; role?: string; name?: string } | undefined
  if (!session || !user?.role || !ALLOWED_ROLES.includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as {
    key?: string
    cursor?: string | null
    batch?: number
    dryRun?: boolean
  }

  const index = body.key ? IMAGE_FIELD_TARGETS.findIndex(t => t.key === body.key) : 0
  if (index < 0) return NextResponse.json({ error: '対象が見つかりません' }, { status: 400 })

  const target = IMAGE_FIELD_TARGETS[index]
  const batch = Math.max(1, Math.min(MAX_BATCH, body.batch ?? 5))
  const dryRun = body.dryRun === true

  const result = await optimizeImageBatch(target, body.cursor ?? null, batch, dryRun)

  // この対象が終わったら次の対象へ
  const nextKey = result.nextCursor === null
    ? (IMAGE_FIELD_TARGETS[index + 1]?.key ?? null)
    : target.key

  if (!dryRun && result.convertedImages > 0) {
    await recordAccessLog({
      userType: user.role,
      userId: user.id ?? '',
      userName: user.name ?? undefined,
      action: `既存画像をWebPに変換（${target.label}・${result.convertedImages}枚）`,
      req: request,
    })
  }

  return NextResponse.json({
    ...result,
    nextKey,
    done: nextKey === null,
    dryRun,
  })
}
