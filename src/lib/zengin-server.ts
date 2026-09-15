/**
 * 全銀データ（金融機関・支店マスタ）の取得。API ルートとサーバー側の入力チェックで共有する。
 *
 * 出典は bank.teraren.com（ページネーション式）。取得に失敗したときは呼び出し側で
 * 「確認できなかった」として扱い、保存を止めないこと（外部APIの不調で登録できなくなるため）。
 *
 * 注意: 'use client' を付けないこと（サーバー専用）
 */

export type ZenginBank = {
  code: string
  name: string
  kana?: string
  hira?: string
  roma?: string
  normalize?: { name?: string; kana?: string; hira?: string; roma?: string }
}

export type ZenginBranch = {
  code: string
  name: string
  kana?: string
  hira?: string
  roma?: string
}

const CACHE_TTL = 24 * 60 * 60 * 1000 // 24h
const BANKS_URL = 'https://bank.teraren.com/banks.json'
const TOTAL_PAGES = 24 // 50件/ページ・約1,200件

let banksCache: ZenginBank[] | null = null
let banksCachedAt = 0
const branchCache = new Map<string, { data: ZenginBranch[]; at: number }>()

/** 全金融機関（キャッシュつき）。失敗時は古いキャッシュ、それも無ければ空配列 */
export async function fetchBanks(): Promise<ZenginBank[]> {
  if (banksCache && Date.now() - banksCachedAt < CACHE_TTL) return banksCache

  try {
    const BATCH = 5
    const all: ZenginBank[] = []
    for (let start = 1; start <= TOTAL_PAGES; start += BATCH) {
      const pages = Array.from(
        { length: Math.min(BATCH, TOTAL_PAGES - start + 1) },
        (_, i) => start + i,
      )
      const results = await Promise.all(
        pages.map(page =>
          fetch(`${BANKS_URL}?page=${page}`, { cache: 'no-store' })
            .then(r => (r.ok ? r.json() : []))
            .catch(() => []),
        ),
      )
      for (const batch of results) all.push(...batch)
    }
    if (all.length === 0) throw new Error('No data fetched')
    banksCache = all
    banksCachedAt = Date.now()
    return all
  } catch {
    return banksCache ?? []
  }
}

/** 指定金融機関の全支店（キャッシュつき）。失敗時は古いキャッシュ、それも無ければ空配列 */
export async function fetchBranches(bankCode: string): Promise<ZenginBranch[]> {
  const cached = branchCache.get(bankCode)
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.data

  try {
    const PER_PAGE = 200
    const MAX_PAGES = 50
    const all: ZenginBranch[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const res = await fetch(
        `https://bank.teraren.com/banks/${bankCode}/branches.json?page=${page}&per=${PER_PAGE}`,
        { next: { revalidate: 86400 } },
      )
      if (!res.ok) throw new Error('Failed to fetch branches')
      const data = await res.json()
      if (!Array.isArray(data) || data.length === 0) break
      all.push(...data)
      if (data.length < PER_PAGE) break
    }
    branchCache.set(bankCode, { data: all, at: Date.now() })
    return all
  } catch {
    return cached?.data ?? []
  }
}

/** 表記ゆれ（「銀行」の有無・前後の空白）を吸収して比べるためのキー */
function nameKey(value: string): string {
  return value.replace(/[\s　]/g, '').replace(/銀行$/, '')
}

/** 名称から金融機関を引く（見つからなければ null） */
export function findBankByName(banks: ZenginBank[], name: string): ZenginBank | null {
  const key = nameKey(name)
  return (
    banks.find(b => nameKey(b.normalize?.name ?? b.name) === key || nameKey(b.name) === key) ?? null
  )
}

/** 名称から支店を引く（「支店」「出張所」の有無を吸収。見つからなければ null） */
export function findBranchByName(branches: ZenginBranch[], name: string): ZenginBranch | null {
  const key = name.replace(/[\s　]/g, '').replace(/(支店|支所|出張所)$/, '')
  return branches.find(b => b.name.replace(/[\s　]/g, '').replace(/(支店|支所|出張所)$/, '') === key) ?? null
}

/**
 * 金融機関・支店が全銀データに存在するか確かめる。
 * 外部APIが引けなかったときは `{ ok: true, checked: false }` を返し、保存を止めない。
 */
export async function verifyBankAndBranch(
  bankName: string,
  branchName: string,
): Promise<{ ok: true; checked: boolean } | { ok: false; field: 'bankName' | 'branchName'; message: string }> {
  const banks = await fetchBanks()
  if (banks.length === 0) return { ok: true, checked: false }

  const bank = findBankByName(banks, bankName)
  if (!bank) {
    return { ok: false, field: 'bankName', message: 'この銀行名が見つかりません。検索して一覧から選択してください' }
  }

  const branches = await fetchBranches(bank.code)
  if (branches.length === 0) return { ok: true, checked: false }

  if (!findBranchByName(branches, branchName)) {
    const label = bank.normalize?.name ?? bank.name
    return { ok: false, field: 'branchName', message: `${label}にこの支店が見つかりません。検索して一覧から選択してください` }
  }
  return { ok: true, checked: true }
}
