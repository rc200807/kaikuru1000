// 管理ポータル「メンバー管理」のCSVインポートの列定義とセル変換（サーバー・クライアント共用）。
// 認証方式は列で指定させず、メールアドレス／ログインID のどちらを埋めたかで判定する
// （メールあり＝メール招待、ログインIDあり＝ID+パスワード方式）。

export type AdminMemberCsvColumn = {
  key: 'name' | 'email' | 'loginId' | 'role'
  header: string
  /** 取込時に受理する別名の見出し */
  aliases?: string[]
  required?: boolean
}

export const ADMIN_MEMBER_CSV_COLUMNS: AdminMemberCsvColumn[] = [
  { key: 'name',    header: '氏名',           aliases: ['名前', 'メンバー名'], required: true },
  { key: 'email',   header: 'メールアドレス', aliases: ['メール'] },
  { key: 'loginId', header: 'ログインID',     aliases: ['ID', 'ログインid'] },
  { key: 'role',    header: 'ロール',         aliases: ['権限', '役割'] },
]

/** CSVの見出し行から、この列に対応する見出しを解決する（別名にも対応） */
export function resolveAdminMemberCsvHeader(
  col: AdminMemberCsvColumn,
  has: (header: string) => boolean,
): string | undefined {
  if (has(col.header)) return col.header
  return (col.aliases ?? []).find(has)
}

export type AdminMemberCsvRole = 'admin' | 'superadmin' | 'hr'

const ROLE_FROM_CELL: Record<string, AdminMemberCsvRole> = {
  '管理者': 'admin', 'admin': 'admin', 'アドミン': 'admin',
  'super admin': 'superadmin', 'superadmin': 'superadmin', 'スーパー管理者': 'superadmin',
  'hr': 'hr', 'hr（人事）': 'hr', 'hr(人事)': 'hr', '人事': 'hr',
}

export const ADMIN_MEMBER_ROLE_CELLS = ['管理者', 'Super Admin', 'HR（人事）'] as const

/**
 * ロール列のセル値 → ロール。空欄は "admin"（既定）。
 * 未知の値は undefined（呼び出し側でエラー扱い）。
 */
export function adminMemberRoleFromCell(cell: string): AdminMemberCsvRole | undefined {
  const t = (cell || '').trim()
  if (!t) return 'admin'
  return ROLE_FROM_CELL[t.toLowerCase()]
}

export const ADMIN_MEMBER_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const ADMIN_MEMBER_LOGIN_ID_RE = /^[a-zA-Z0-9._-]+$/
