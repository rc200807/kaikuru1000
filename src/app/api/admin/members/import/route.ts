import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { parseCsv, buildCsv } from '@/lib/csv-parser'
import { ADMIN_ROLES } from '@/lib/admin-auth'
import { generateSecurePassword } from '@/lib/password-utils'
import { sendWelcomeWithPasswordEmail } from '@/lib/mailer'
import { recordAccessLog } from '@/lib/access-log'
import {
  ADMIN_MEMBER_CSV_COLUMNS,
  ADMIN_MEMBER_EMAIL_RE,
  ADMIN_MEMBER_LOGIN_ID_RE,
  adminMemberRoleFromCell,
  resolveAdminMemberCsvHeader,
  type AdminMemberCsvRole,
} from '@/lib/admin-member-csv'

type RowError = { row: number; message: string }
type CreatedRow = {
  row: number
  name: string
  role: AdminMemberCsvRole
  authMethod: 'email' | 'idpass'
  email: string | null
  loginId: string | null
  password: string
  emailSent: boolean
}

// 取込前に組み立てる1行分のデータ（全行を検証してから作成する）
type PendingRow = {
  row: number
  name: string
  role: AdminMemberCsvRole
  authMethod: 'email' | 'idpass'
  email: string | null
  loginId: string | null
}

async function requireMemberManager() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) return null
  // メンバー追加と同じ権限（hr は不可）
  if (user.role !== 'superadmin' && user.role !== 'admin') return null
  return user as { id: string; role: 'admin' | 'superadmin' | 'hr'; name?: string | null }
}

/** GET: サンプルCSV（テンプレート）のダウンロード */
export async function GET() {
  const user = await requireMemberManager()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const headers = ADMIN_MEMBER_CSV_COLUMNS.map(c => (c.required ? `${c.header}*` : c.header))
  const rows = [
    // メール招待（招待メールでログイン情報を通知）
    ['山田 太郎', 't.yamada@example.com', '', '管理者'],
    // ID+パスワード方式（メールを持たない人。パスキー登録＋superadmin承認が必要）
    ['佐藤 花子', '', 's.sato', 'HR（人事）'],
  ]
  const csv = buildCsv([headers, ...rows])

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="admin-members-import-template.csv"',
    },
  })
}

/**
 * POST: CSVから管理者メンバーを一括登録する。
 *
 * 認証方式は列ではなく入力内容から決める（メールアドレス＝メール招待／ログインID＝ID+パスワード方式）。
 * 1行でも不正なら、その行だけスキップして残りは登録する（全件ロールバックはしない）。
 * 初期パスワードは行ごとに自動生成し、レスポンスで一度だけ返す。
 */
export async function POST(req: NextRequest) {
  const user = await requireMemberManager()
  if (!user) return NextResponse.json({ error: 'メンバーの追加権限がありません' }, { status: 403 })

  // 招待メールを送るか（既定は送る＝単体追加と同じ挙動）
  let sendEmail = true
  let csvText = ''

  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'ファイルサイズは2MB以下にしてください' }, { status: 400 })
    }
    csvText = await file.text()
    sendEmail = formData.get('sendEmail') !== 'false'
  } else {
    const body = await req.json().catch(() => ({}))
    csvText = typeof body.csv === 'string' ? body.csv : ''
    if (!csvText) return NextResponse.json({ error: 'CSVデータが空です' }, { status: 400 })
    sendEmail = body.sendEmail !== false
  }

  const rows = parseCsv(csvText)
  if (rows.length < 2) {
    return NextResponse.json({ error: 'ヘッダー行とデータ行が必要です' }, { status: 400 })
  }

  // 見出し → 列インデックス（末尾の * は除去して比較）
  const headerRow = rows[0].map(h => h.trim().replace(/\*+$/, ''))
  const idxOf: Record<string, number> = {}
  headerRow.forEach((h, i) => { if (h && !(h in idxOf)) idxOf[h] = i })

  const headerByKey = new Map<string, string>()
  for (const col of ADMIN_MEMBER_CSV_COLUMNS) {
    const header = resolveAdminMemberCsvHeader(col, h => h in idxOf)
    if (header) headerByKey.set(col.key, header)
  }

  const nameCol = ADMIN_MEMBER_CSV_COLUMNS.find(c => c.key === 'name')!
  if (!headerByKey.has('name')) {
    return NextResponse.json({ error: `必須列「${nameCol.header}」が見つかりません` }, { status: 400 })
  }
  if (!headerByKey.has('email') && !headerByKey.has('loginId')) {
    return NextResponse.json(
      { error: '「メールアドレス」または「ログインID」の列が必要です' },
      { status: 400 },
    )
  }

  const cell = (row: string[], key: string) => {
    const header = headerByKey.get(key)
    if (!header) return ''
    const idx = idxOf[header]
    return idx === undefined ? '' : (row[idx] ?? '').trim()
  }

  const errors: RowError[] = []
  const pending: PendingRow[] = []
  // CSV内の重複検出（メールは大文字小文字を無視、ログインIDは完全一致）
  const seenEmails = new Set<string>()
  const seenLoginIds = new Set<string>()

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (row.every(c => !(c ?? '').trim())) continue
    const lineNo = r + 1

    const name = cell(row, 'name')
    const email = cell(row, 'email')
    const loginId = cell(row, 'loginId')
    const roleCell = cell(row, 'role')

    if (!name) { errors.push({ row: lineNo, message: '氏名が空です' }); continue }
    if (name.length > 100) { errors.push({ row: lineNo, message: '氏名が長すぎます（100文字以内）' }); continue }

    const role = adminMemberRoleFromCell(roleCell)
    if (!role) {
      errors.push({ row: lineNo, message: `ロールが不正です「${roleCell}」（管理者 / Super Admin / HR（人事））` })
      continue
    }

    if (email && loginId) {
      errors.push({ row: lineNo, message: 'メールアドレスとログインIDは、どちらか一方だけを入力してください' })
      continue
    }
    if (!email && !loginId) {
      errors.push({ row: lineNo, message: 'メールアドレスまたはログインIDのどちらかが必要です' })
      continue
    }

    // ── メール招待 ──
    if (email) {
      if (!ADMIN_MEMBER_EMAIL_RE.test(email)) {
        errors.push({ row: lineNo, message: `メールアドレスの形式が不正です「${email}」` })
        continue
      }
      const key = email.toLowerCase()
      if (seenEmails.has(key)) {
        errors.push({ row: lineNo, message: `メールアドレスがCSV内で重複しています「${email}」` })
        continue
      }
      seenEmails.add(key)
      pending.push({ row: lineNo, name, role, authMethod: 'email', email, loginId: null })
      continue
    }

    // ── ID+パスワード方式（メールなし・パスキー必須・superadmin承認必須）──
    if (role === 'superadmin') {
      errors.push({ row: lineNo, message: 'ID+パスワード方式では Super Admin を指定できません' })
      continue
    }
    if (loginId.length < 4 || loginId.length > 50) {
      errors.push({ row: lineNo, message: `ログインIDは4〜50文字で入力してください「${loginId}」` })
      continue
    }
    if (!ADMIN_MEMBER_LOGIN_ID_RE.test(loginId)) {
      errors.push({ row: lineNo, message: `ログインIDは半角英数字と . _ - のみ使用できます「${loginId}」` })
      continue
    }
    if (seenLoginIds.has(loginId)) {
      errors.push({ row: lineNo, message: `ログインIDがCSV内で重複しています「${loginId}」` })
      continue
    }
    seenLoginIds.add(loginId)
    pending.push({ row: lineNo, name, role, authMethod: 'idpass', email: null, loginId })
  }

  // 既存アカウントとの重複を一括で照会
  // （メールは管理ポータルの管理者間のみ、ログインIDは Admin 全体で一意）
  const emails = pending.map(p => p.email).filter((v): v is string => !!v)
  const loginIds = pending.map(p => p.loginId).filter((v): v is string => !!v)
  const [existingByEmail, existingByLoginId] = await Promise.all([
    emails.length > 0
      ? prisma.admin.findMany({
          where: { email: { in: emails }, role: { not: 'sysadmin' } },
          select: { email: true },
        })
      : Promise.resolve([]),
    loginIds.length > 0
      ? prisma.admin.findMany({ where: { loginId: { in: loginIds } }, select: { loginId: true } })
      : Promise.resolve([]),
  ])
  const takenEmails = new Set(existingByEmail.map(a => (a.email ?? '').toLowerCase()))
  const takenLoginIds = new Set(existingByLoginId.map(a => a.loginId ?? ''))

  const baseUrl = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
  const loginUrl = `${baseUrl}/admin/login`
  const created: CreatedRow[] = []

  for (const p of pending) {
    if (p.email && takenEmails.has(p.email.toLowerCase())) {
      errors.push({ row: p.row, message: `このメールアドレスはすでに使用されています「${p.email}」` })
      continue
    }
    if (p.loginId && takenLoginIds.has(p.loginId)) {
      errors.push({ row: p.row, message: `このログインIDはすでに使用されています「${p.loginId}」` })
      continue
    }

    const rawPassword = generateSecurePassword()
    const hashed = await bcrypt.hash(rawPassword, 10)

    try {
      const member = await prisma.admin.create({
        data: p.authMethod === 'idpass'
          ? {
              name: p.name, email: null, loginId: p.loginId, password: hashed,
              role: p.role, authMethod: 'idpass', status: 'pending_passkey',
            }
          : {
              name: p.name, email: p.email, password: hashed,
              role: p.role, authMethod: 'email', status: 'active',
            },
        select: { id: true, name: true, email: true, loginId: true, role: true },
      })

      // 同一CSV内の後続行が同じ値を使えないように、確定した値を控える
      if (member.email) takenEmails.add(member.email.toLowerCase())
      if (member.loginId) takenLoginIds.add(member.loginId)

      // 招待メール（メール方式のみ・送信オフなら初期パスワードを画面で受け渡す）
      let emailSent = false
      if (p.authMethod === 'email' && sendEmail && p.email) {
        try {
          emailSent = await sendWelcomeWithPasswordEmail({
            to: p.email, name: p.name, email: p.email, password: rawPassword, loginUrl,
          })
        } catch (e) {
          console.error('[members/import] 招待メールの送信に失敗:', e)
        }
      }

      created.push({
        row: p.row,
        name: member.name,
        role: p.role,
        authMethod: p.authMethod,
        email: member.email,
        loginId: member.loginId,
        password: rawPassword,
        emailSent,
      })
    } catch (e) {
      errors.push({ row: p.row, message: `登録に失敗しました: ${e instanceof Error ? e.message : String(e)}` })
    }
  }

  if (created.length > 0) {
    await recordAccessLog({
      userType: user.role,
      userId: user.id,
      userName: user.name ?? '',
      action: `管理者メンバーCSVインポート（新規${created.length}件・エラー${errors.length}件）`,
      req,
    })
  }

  return NextResponse.json({
    created: created.length,
    totalRows: rows.length - 1,
    results: created,
    errors,
    emailRequested: sendEmail,
  })
}
