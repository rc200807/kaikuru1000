// 顧客氏名の姓・名分割ユーティリティ（Prisma非依存の純関数。client/server両方から利用可）
// User.name / User.furigana（結合値）が正データであり続ける。分割値は入力・編集用の補助フィールド。

/** 全角・連続スペースを半角1個に正規化して trim */
function normalizeSpaces(value: string): string {
  return value.replace(/[\s　]+/g, ' ').trim()
}

/** 姓＋名を "姓 名" に結合。片方だけなら単独で返す */
export function combineName(last?: string | null, first?: string | null): string {
  const l = normalizeSpaces(last || '')
  const f = normalizeSpaces(first || '')
  if (l && f) return `${l} ${f}`
  return l || f
}

/** 結合氏名を最初のスペースで姓・名に分割。スペースなしは全体を姓、名は空 */
export function splitName(full: string | null | undefined): { last: string; first: string } {
  const normalized = normalizeSpaces(full || '')
  if (!normalized) return { last: '', first: '' }
  const spaceIndex = normalized.indexOf(' ')
  if (spaceIndex < 0) return { last: normalized, first: '' }
  return {
    last: normalized.slice(0, spaceIndex),
    first: normalized.slice(spaceIndex + 1),
  }
}

export type NameInput = {
  name?: string | null
  furigana?: string | null
  lastName?: string | null
  firstName?: string | null
  lastNameKana?: string | null
  firstNameKana?: string | null
}

export type UserNameData = {
  name: string
  furigana: string
  lastName: string | null
  firstName: string | null
  lastNameKana: string | null
  firstNameKana: string | null
}

/**
 * 分割入力・結合入力のどちらからでも6フィールド全部を確定する。
 * 分割値があればそれを正として結合値を合成、結合値のみなら splitName でベストエフォート分割。
 * Prisma の create/update data にそのまま展開する用。
 */
export function buildUserNameData(input: NameInput): UserNameData {
  const hasSplitName = !!(normalizeSpaces(input.lastName || '') || normalizeSpaces(input.firstName || ''))
  const hasSplitKana = !!(normalizeSpaces(input.lastNameKana || '') || normalizeSpaces(input.firstNameKana || ''))

  let lastName: string
  let firstName: string
  if (hasSplitName) {
    lastName = normalizeSpaces(input.lastName || '')
    firstName = normalizeSpaces(input.firstName || '')
  } else {
    const split = splitName(input.name)
    lastName = split.last
    firstName = split.first
  }

  let lastNameKana: string
  let firstNameKana: string
  if (hasSplitKana) {
    lastNameKana = normalizeSpaces(input.lastNameKana || '')
    firstNameKana = normalizeSpaces(input.firstNameKana || '')
  } else {
    const split = splitName(input.furigana)
    lastNameKana = split.last
    firstNameKana = split.first
  }

  return {
    name: combineName(lastName, firstName),
    furigana: combineName(lastNameKana, firstNameKana),
    lastName: lastName || null,
    firstName: firstName || null,
    lastNameKana: lastNameKana || null,
    firstNameKana: firstNameKana || null,
  }
}

/**
 * 部分更新（PATCH）用。氏名グループ・かなグループのうち入力があったものだけを
 * 6フィールド整合の形で返す（未入力のグループには触れない）。
 * 分割値（新UI）優先、結合値のみ（旧クライアント）は splitName で分割値も生成。
 */
export function buildUserNameUpdateData(input: NameInput): Partial<UserNameData> {
  const updateData: Partial<UserNameData> = {}
  if (input.lastName !== undefined || input.firstName !== undefined) {
    const combined = combineName(input.lastName, input.firstName)
    if (combined) {
      updateData.name = combined
      updateData.lastName = normalizeSpaces(input.lastName || '') || null
      updateData.firstName = normalizeSpaces(input.firstName || '') || null
    }
  } else if (input.name) {
    const s = splitName(input.name)
    updateData.name = combineName(s.last, s.first)
    updateData.lastName = s.last || null
    updateData.firstName = s.first || null
  }
  if (input.lastNameKana !== undefined || input.firstNameKana !== undefined) {
    const combined = combineName(input.lastNameKana, input.firstNameKana)
    if (combined) {
      updateData.furigana = combined
      updateData.lastNameKana = normalizeSpaces(input.lastNameKana || '') || null
      updateData.firstNameKana = normalizeSpaces(input.firstNameKana || '') || null
    }
  } else if (input.furigana) {
    const s = splitName(input.furigana)
    updateData.furigana = combineName(s.last, s.first)
    updateData.lastNameKana = s.last || null
    updateData.firstNameKana = s.first || null
  }
  return updateData
}

/**
 * 編集フォームの初期値用。分割値が未設定の旧データは結合値からフォールバック分割する。
 */
export function getSplitName(user: {
  name?: string | null
  furigana?: string | null
  lastName?: string | null
  firstName?: string | null
  lastNameKana?: string | null
  firstNameKana?: string | null
}): { lastName: string; firstName: string; lastNameKana: string; firstNameKana: string } {
  const nameSplit = user.lastName
    ? { last: user.lastName, first: user.firstName || '' }
    : splitName(user.name)
  const kanaSplit = user.lastNameKana
    ? { last: user.lastNameKana, first: user.firstNameKana || '' }
    : splitName(user.furigana)
  return {
    lastName: nameSplit.last,
    firstName: nameSplit.first,
    lastNameKana: kanaSplit.last,
    firstNameKana: kanaSplit.first,
  }
}
