import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { mergeCustomers, MERGE_SCALAR_FIELDS, type MergeScalarField } from '@/lib/merge-customers'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

/**
 * 顧客統合: mergedId を survivorId に統合する。
 * - 管理者(admin/superadmin/hr): 全顧客を統合可
 * - 店舗(store): 両顧客とも自店舗(storeId===自ID)の場合のみ
 * body: { survivorId, mergedId, scalars: { [field]: value } }
 *   scalars は「残す顧客(survivor)」に統一する項目の最終値（項目別選択の結果）
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const isAdmin = ADMIN_ROLES.includes(sessionUser.role)
  const isStore = sessionUser.role === 'store'
  if (!isAdmin && !isStore) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const survivorId: string = body.survivorId
  const mergedId: string = body.mergedId
  const rawScalars = (body.scalars ?? {}) as Record<string, unknown>

  if (!survivorId || !mergedId) return NextResponse.json({ error: '統合する2件の顧客を指定してください' }, { status: 400 })
  if (survivorId === mergedId) return NextResponse.json({ error: '同一の顧客は統合できません' }, { status: 400 })

  const [survivor, merged] = await Promise.all([
    prisma.user.findUnique({ where: { id: survivorId }, select: { id: true, storeId: true, mergedIntoUserId: true } }),
    prisma.user.findUnique({ where: { id: mergedId }, select: { id: true, storeId: true, mergedIntoUserId: true } }),
  ])
  if (!survivor || !merged) return NextResponse.json({ error: '顧客が見つかりません' }, { status: 404 })
  if (survivor.mergedIntoUserId || merged.mergedIntoUserId) {
    return NextResponse.json({ error: '既に統合済みの顧客が含まれています' }, { status: 400 })
  }
  // 店舗は両顧客とも自店舗のみ
  if (isStore && (survivor.storeId !== sessionUser.id || merged.storeId !== sessionUser.id)) {
    return NextResponse.json({ error: '自店舗の顧客のみ統合できます' }, { status: 403 })
  }

  // scalars はホワイトリストのみ採用
  const scalars: Partial<Record<MergeScalarField, unknown>> = {}
  for (const key of MERGE_SCALAR_FIELDS) {
    if (rawScalars[key] !== undefined) scalars[key] = rawScalars[key]
  }

  try {
    await prisma.$transaction(async (tx) => {
      await mergeCustomers(tx, survivorId, mergedId, scalars)
    })
  } catch (e) {
    console.error('顧客統合エラー:', e)
    return NextResponse.json({ error: '統合に失敗しました。時間をおいて再度お試しください。' }, { status: 500 })
  }

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, memberId: sessionUser.memberId ?? null, action: `顧客を統合（${mergedId} → ${survivorId}）`, req: request })
  return NextResponse.json({ success: true, survivorId })
}
