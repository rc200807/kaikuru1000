import { prisma } from '@/lib/prisma'

export type ResolvedWorkItemMaster =
  | { ok: true; masterId: string | null; workName: string; defaultUnitPrice: number | null }
  | { ok: false; error: string }

/**
 * 案件・訪問に登録する請求項目を、管理ポータルのマスタに突き合わせて解決する。
 *
 * - masterId が来ればそれを正とし、作業名はマスタ名のスナップショットを入れる。
 * - masterId がない場合は作業名でマスタを引く（既存クライアント・CSV等の互換）。
 * - マスタが1件も登録されていない環境では自由入力を許可する（マスタ未整備で入力不能にしない）。
 */
export async function resolveWorkItemMaster(input: {
  masterId?: unknown
  workName?: unknown
}): Promise<ResolvedWorkItemMaster> {
  const masterId = typeof input.masterId === 'string' && input.masterId ? input.masterId : null
  const workName = typeof input.workName === 'string' ? input.workName.trim() : ''

  if (masterId) {
    const master = await prisma.workItemMaster.findUnique({ where: { id: masterId } })
    if (!master) return { ok: false, error: '選択された請求項目が見つかりません' }
    return { ok: true, masterId: master.id, workName: master.name, defaultUnitPrice: master.defaultUnitPrice }
  }

  if (workName) {
    const master = await prisma.workItemMaster.findUnique({ where: { name: workName } })
    if (master) return { ok: true, masterId: master.id, workName: master.name, defaultUnitPrice: master.defaultUnitPrice }
  }

  // マスタ未整備のときだけ自由入力を通す
  const total = await prisma.workItemMaster.count()
  if (total === 0) {
    if (!workName) return { ok: false, error: '作業名は必須です' }
    return { ok: true, masterId: null, workName, defaultUnitPrice: null }
  }

  return { ok: false, error: '請求項目は管理ポータルで登録された項目から選択してください' }
}
