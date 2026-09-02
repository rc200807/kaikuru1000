import { prisma } from '@/lib/prisma'

export type ResolvedWorkItem = {
  masterId: string | null
  workName: string
  defaultUnitPrice: number | null
  /** チェックされたオプション（label はスナップショット） */
  options: { optionId: string; label: string; sortOrder: number }[]
  extraStaffCount: number | null
  /** 備考の自由記入部分 */
  notesInput: string | null
  /** 組み立て済みの備考（見積・契約書もこれを表示する） */
  notes: string | null
}

export type ResolveResult = { ok: true; value: ResolvedWorkItem } | { ok: false; error: string }

/**
 * 備考の表示テキストを組み立てる。
 * チェック項目 → 追加人員 → 自由記入 の順に改行で並べる。
 */
export function composeWorkItemNotes(input: {
  optionLabels: string[]
  extraStaffCount: number | null
  notesInput: string | null
}): string | null {
  const lines: string[] = []
  if (input.optionLabels.length > 0) lines.push(input.optionLabels.join('、'))
  if (input.extraStaffCount && input.extraStaffCount > 0) lines.push(`追加人員: ${input.extraStaffCount}名`)
  const free = input.notesInput?.trim()
  if (free) lines.push(free)
  return lines.length > 0 ? lines.join('\n') : null
}

/**
 * 案件・訪問に登録する請求項目を、管理ポータルのマスタに突き合わせて解決する。
 *
 * - masterId が来ればそれを正とし、作業名はマスタ名のスナップショットを入れる。
 * - masterId がない場合は作業名でマスタを引く（既存クライアント・CSV等の互換）。
 * - マスタが1件も登録されていない環境では自由入力を許可する（マスタ未整備で入力不能にしない）。
 * - チェック項目・追加人員も、そのマスタに登録されたものだけを受け付ける。
 */
export async function resolveWorkItemMaster(input: {
  masterId?: unknown
  workName?: unknown
  optionIds?: unknown
  extraStaffCount?: unknown
  notes?: unknown
}): Promise<ResolveResult> {
  const masterId = typeof input.masterId === 'string' && input.masterId ? input.masterId : null
  const workName = typeof input.workName === 'string' ? input.workName.trim() : ''
  const notesInput = typeof input.notes === 'string' && input.notes.trim() ? input.notes.trim() : null

  const master = masterId
    ? await prisma.workItemMaster.findUnique({ where: { id: masterId }, include: { options: { orderBy: { sortOrder: 'asc' } } } })
    : workName
      ? await prisma.workItemMaster.findUnique({ where: { name: workName }, include: { options: { orderBy: { sortOrder: 'asc' } } } })
      : null

  if (masterId && !master) return { ok: false, error: '選択された請求項目が見つかりません' }

  if (!master) {
    // マスタ未整備のときだけ自由入力を通す
    const total = await prisma.workItemMaster.count()
    if (total > 0) return { ok: false, error: '請求項目は管理ポータルで登録された項目から選択してください' }
    if (!workName) return { ok: false, error: '作業名は必須です' }
    return {
      ok: true,
      value: {
        masterId: null,
        workName,
        defaultUnitPrice: null,
        options: [],
        extraStaffCount: null,
        notesInput,
        notes: composeWorkItemNotes({ optionLabels: [], extraStaffCount: null, notesInput }),
      },
    }
  }

  // チェック項目：このマスタに紐づく選択肢だけを受け付ける
  const requestedIds = Array.isArray(input.optionIds)
    ? input.optionIds.filter((v): v is string => typeof v === 'string' && !!v)
    : []
  const unknownId = requestedIds.find(id => !master.options.some(o => o.id === id))
  if (unknownId) return { ok: false, error: 'この請求項目に登録されていないチェック項目が含まれています' }
  const options = master.options
    .filter(o => requestedIds.includes(o.id))
    .map(o => ({ optionId: o.id, label: o.label, sortOrder: o.sortOrder }))

  // 追加人員：マスタで許可されている場合のみ
  let extraStaffCount: number | null = null
  const rawStaff = input.extraStaffCount
  if (rawStaff !== undefined && rawStaff !== null && rawStaff !== '') {
    const n = Math.trunc(Number(rawStaff))
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: '追加人員は0以上の人数で入力してください' }
    if (n > 0 && !master.allowExtraStaff) return { ok: false, error: 'この請求項目では追加人員を登録できません' }
    extraStaffCount = n > 0 ? n : null
  }

  return {
    ok: true,
    value: {
      masterId: master.id,
      workName: master.name,
      defaultUnitPrice: master.defaultUnitPrice,
      options,
      extraStaffCount,
      notesInput,
      notes: composeWorkItemNotes({ optionLabels: options.map(o => o.label), extraStaffCount, notesInput }),
    },
  }
}
