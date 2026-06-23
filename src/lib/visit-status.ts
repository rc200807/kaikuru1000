// 訪問スケジュールで「選択可能」なステータスのキー。
// 見積のみ・契約・対応完了などの契約進捗系は「案件（Deal）」側で管理するため、
// 訪問スケジュールのステータスは以下4つに限定する。
export const SELECTABLE_VISIT_STATUS_KEYS = ['scheduled', 'rescheduled', 'absent', 'cancelled'] as const

export function isSelectableVisitStatus(key: string): boolean {
  return (SELECTABLE_VISIT_STATUS_KEYS as readonly string[]).includes(key)
}

/**
 * ステータス選択ドロップダウン用に、選択可能な4ステータスのみへ絞り込む。
 * ただし現在値が選択可能外（既存レコードの旧ステータス等）の場合は、
 * 表示が空にならないよう現在値も残す。
 * @param options value(=key) を持つ選択肢配列
 * @param currentValue 現在選択中の値（任意）
 */
export function filterSelectableStatusOptions<T extends { value: string }>(
  options: T[],
  currentValue?: string,
): T[] {
  return options.filter(
    o => o.value === '' || isSelectableVisitStatus(o.value) || (currentValue != null && o.value === currentValue),
  )
}
