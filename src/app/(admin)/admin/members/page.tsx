'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AppBar from '@/components/AppBar'
import Card from '@/components/Card'
import Button from '@/components/Button'
import TextField from '@/components/TextField'
import Modal from '@/components/Modal'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmptyState from '@/components/EmptyState'

type AdminRole = 'admin' | 'superadmin' | 'hr'
type AdminStatus = 'active' | 'pending_passkey' | 'pending_approval'

type AdminMember = {
  id: string
  name: string
  email: string | null
  loginId?: string | null
  role: AdminRole
  authMethod?: 'email' | 'idpass'
  status?: AdminStatus
  approvedAt?: string | null
  createdAt: string
}

const STATUS_META: Record<AdminStatus, { label: string; cls: string }> = {
  active: { label: '有効', cls: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' },
  pending_passkey: { label: 'パスキー登録待ち', cls: 'bg-sky-500/15 text-sky-300 border border-sky-500/30' },
  pending_approval: { label: '承認待ち', cls: 'bg-amber-500/15 text-amber-300 border border-amber-500/30' },
}

type ImportCreatedRow = {
  row: number
  name: string
  role: AdminRole
  authMethod: 'email' | 'idpass'
  email: string | null
  loginId: string | null
  password: string
  emailSent: boolean
}

type ImportResult = {
  created: number
  totalRows: number
  results: ImportCreatedRow[]
  errors: { row: number; message: string }[]
  emailRequested: boolean
}

const ROLE_LABEL: Record<AdminRole, string> = {
  superadmin: 'Super Admin',
  hr: 'HR（人事）',
  admin: '管理者',
}

const ROLE_BADGE_STYLE: Record<AdminRole, string> = {
  superadmin: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  hr: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  admin: 'bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] border border-transparent',
}

export default function AdminMembersPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [members, setMembers] = useState<AdminMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '' })
  // 招待方式: 'email'（メール招待） | 'idpass'（ID+パスワード発行・パスキー必須・承認必須）
  const [inviteMethod, setInviteMethod] = useState<'email' | 'idpass'>('email')
  const [loginId, setLoginId] = useState('')
  const [idpassRole, setIdpassRole] = useState<'admin' | 'hr'>('admin')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // ID+パスワード発行の結果（一度だけ表示）
  const [idpassResult, setIdpassResult] = useState<{ name: string; loginId: string; password: string } | null>(null)
  const [idCopied, setIdCopied] = useState(false)
  const [idPwCopied, setIdPwCopied] = useState(false)
  // 承認処理中のID
  const [approvingId, setApprovingId] = useState<string | null>(null)

  // 削除確認モーダル
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  // CSVインポート
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importSendEmail, setImportSendEmail] = useState(true)
  const [importError, setImportError] = useState('')
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [importListCopied, setImportListCopied] = useState(false)

  // ロール変更
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null)

  // パスワード再発行
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string; email: string } | null>(null)
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [resetResult, setResetResult] = useState<{ name: string; email: string; password: string; emailSent: boolean } | null>(null)
  const [pwCopied, setPwCopied] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
    if (status === 'authenticated') {
      const sessionUser = session.user as any
      const allowed = ['admin', 'superadmin', 'hr']
      if (!allowed.includes(sessionUser.role)) router.push('/')
    }
  }, [status, session, router])

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/admin/members')
        .then(r => r.json())
        .then(data => {
          setMembers(Array.isArray(data) ? data : [])
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }
  }, [status])

  function resetForm() {
    setForm({ name: '', email: '' })
    setLoginId('')
    setIdpassRole('admin')
    setInviteMethod('email')
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    const payload = inviteMethod === 'idpass'
      ? { authMethod: 'idpass', name: form.name, loginId, role: idpassRole }
      : form

    const res = await fetch('/api/admin/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    setSaving(false)
    if (res.ok) {
      const created = await res.json()
      setMembers(prev => [...prev, created])
      if (inviteMethod === 'idpass') {
        // ID＋初期パスワードを一度だけ表示（メール送信なし）
        setIdpassResult({ name: created.name, loginId: created.loginId, password: created.initialPassword })
        setMessage({ type: 'success', text: `${created.name} さんのアカウントを発行しました。ID・初期パスワードを本人にお伝えください。` })
      } else {
        const emailMsg = created.emailSent
          ? `招待メールを ${form.email} に送信しました`
          : '（メール送信に失敗しました。メール設定を確認してください）'
        setMessage({ type: 'success', text: `${form.name} さんのアカウントを作成しました。${emailMsg}` })
      }
      setShowForm(false)
      resetForm()
    } else {
      const d = await res.json()
      setMessage({ type: 'error', text: d.error || 'アカウントの作成に失敗しました' })
    }
  }

  async function handleApprove(id: string, name: string) {
    setApprovingId(id)
    setMessage(null)
    const res = await fetch(`/api/admin/members/${id}/approve`, { method: 'POST' })
    setApprovingId(null)
    if (res.ok) {
      const updated = await res.json()
      setMembers(prev => prev.map(m => (m.id === id ? { ...m, ...updated } : m)))
      setMessage({ type: 'success', text: `${name} さんのアカウントを承認しました` })
    } else {
      const d = await res.json().catch(() => ({}))
      setMessage({ type: 'error', text: d.error || '承認に失敗しました' })
    }
  }

  async function handleResetPassword(id: string, name: string) {
    setResettingId(id)
    setResetTarget(null)

    const res = await fetch(`/api/admin/members/${id}/reset-password`, { method: 'POST' })
    setResettingId(null)
    if (res.ok) {
      const data = await res.json()
      setResetResult({
        name,
        email: data.email,
        password: data.password,
        emailSent: !!data.emailSent,
      })
    } else {
      const d = await res.json().catch(() => ({}))
      setMessage({ type: 'error', text: d.error || 'パスワードの再発行に失敗しました' })
    }
  }

  function copyPassword() {
    if (!resetResult) return
    navigator.clipboard.writeText(resetResult.password)
    setPwCopied(true)
    setTimeout(() => setPwCopied(false), 2000)
  }

  function openImport() {
    setImportError('')
    setImportResult(null)
    setImportListCopied(false)
    setImportOpen(true)
  }

  function refreshMembers() {
    fetch('/api/admin/members')
      .then(r => (r.ok ? r.json() : []))
      .then(data => setMembers(Array.isArray(data) ? data : []))
      .catch(() => { /* 一覧の再取得失敗は致命ではない */ })
  }

  async function handleImport(file: File) {
    setImporting(true)
    setImportError('')
    setImportResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('sendEmail', importSendEmail ? 'true' : 'false')
      const res = await fetch('/api/admin/members/import', { method: 'POST', body: fd })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setImportError(data.error || 'インポートに失敗しました')
        return
      }
      setImportResult(data as ImportResult)
      if (data.created > 0) refreshMembers()
    } catch {
      setImportError('インポートに失敗しました')
    } finally {
      setImporting(false)
    }
  }

  /** 発行したログイン情報をまとめてコピー（氏名／ID・メール／初期パスワードのタブ区切り） */
  function copyImportedCredentials() {
    if (!importResult) return
    const text = importResult.results
      .map(r => [r.name, r.email ?? r.loginId ?? '', r.password].join('\t'))
      .join('\n')
    navigator.clipboard.writeText(text)
    setImportListCopied(true)
    setTimeout(() => setImportListCopied(false), 2000)
  }

  async function handleDelete(id: string, name: string) {
    setDeletingId(id)
    setDeleteTarget(null)

    const res = await fetch(`/api/admin/members/${id}`, { method: 'DELETE' })
    setDeletingId(null)
    if (res.ok) {
      setMembers(prev => prev.filter(m => m.id !== id))
      setMessage({ type: 'success', text: `${name} さんのアカウントを削除しました` })
    } else {
      const d = await res.json()
      setMessage({ type: 'error', text: d.error || '削除に失敗しました' })
    }
  }

  async function handleChangeRole(id: string, newRole: AdminRole) {
    setRoleUpdatingId(id)
    setMessage(null)
    const res = await fetch(`/api/admin/members/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    })
    setRoleUpdatingId(null)
    if (res.ok) {
      const updated = await res.json()
      setMembers(prev => prev.map(m => (m.id === id ? { ...m, role: updated.role } : m)))
      setMessage({ type: 'success', text: `${updated.name} さんのロールを ${ROLE_LABEL[updated.role as AdminRole]} に変更しました` })
    } else {
      const d = await res.json().catch(() => ({}))
      setMessage({ type: 'error', text: d.error || 'ロール変更に失敗しました' })
    }
  }

  const sessionUser = session?.user as any
  const sessionRole = sessionUser?.role as AdminRole | undefined
  const canManageRoles = sessionRole === 'superadmin' || sessionRole === 'admin'
  const otherMembers = members.filter(m => m.id !== sessionUser?.id)
  const myMember = members.find(m => m.id === sessionUser?.id)

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  }

  return (
    <>
      <AppBar
        title="メンバー管理"
        subtitle="管理ポータル"
        actions={
          canManageRoles ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outlined"
                size="sm"
                onClick={openImport}
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 16V4m0 12l-4-4m4 4l4-4M4 20h16" />
                  </svg>
                }
              >
                CSVインポート
              </Button>
              <Button
                variant="filled"
                size="sm"
                onClick={() => { setShowForm(true); setMessage(null) }}
                icon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                }
              >
                メンバー追加
              </Button>
            </div>
          ) : null
        }
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* メッセージ */}
        {message && (
          <MessageBanner
            severity={message.type}
            dismissible
            onDismiss={() => setMessage(null)}
          >
            {message.text}
          </MessageBanner>
        )}

        {/* 自分のアカウント */}
        <Card variant="elevated" padding="none">
          <div className="px-4 sm:px-6 py-3 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
            <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide">
              自分のアカウント
            </p>
          </div>
          <div className="px-4 sm:px-6 py-4 flex items-center gap-4">
            <div className="w-10 h-10 bg-[var(--portal-primary,#374151)] rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[var(--portal-on-primary,#fff)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{sessionUser?.name}</p>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{sessionUser?.email}</p>
            </div>
            {myMember && (
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_BADGE_STYLE[myMember.role]}`}>
                {ROLE_LABEL[myMember.role]}
              </span>
            )}
            <span className="text-xs font-medium bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)] px-2.5 py-1 rounded-full">
              ログイン中
            </span>
          </div>
        </Card>

        {/* 他の管理者メンバー一覧 */}
        <Card variant="elevated" padding="none">
          <div className="px-4 sm:px-6 py-3 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
            <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide">
              その他のメンバー（{otherMembers.length}名）
            </p>
          </div>

          {otherMembers.length > 0 ? (
            otherMembers.map(member => (
              <div
                key={member.id}
                className="px-4 sm:px-6 py-4 flex items-center gap-4 border-b border-[var(--md-sys-color-surface-container-high)] last:border-0 hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors"
              >
                <div className="w-10 h-10 bg-[var(--md-sys-color-surface-container-high)] rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[var(--md-sys-color-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)]">{member.name}</p>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    {member.authMethod === 'idpass'
                      ? <>ID: <span className="font-mono">{member.loginId}</span></>
                      : member.email}
                  </p>
                </div>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0 hidden sm:block">
                  {format(new Date(member.createdAt), 'yyyy/M/d 追加', { locale: ja })}
                </p>
                {/* ID+パスワード方式のステータスバッジ */}
                {member.authMethod === 'idpass' && member.status && (
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full flex-shrink-0 ${STATUS_META[member.status].cls}`}>
                    {STATUS_META[member.status].label}
                  </span>
                )}
                {canManageRoles && member.authMethod !== 'idpass' ? (
                  <select
                    value={member.role}
                    disabled={roleUpdatingId === member.id}
                    onChange={e => handleChangeRole(member.id, e.target.value as AdminRole)}
                    className={`text-xs font-medium px-2 py-1 rounded-full ${ROLE_BADGE_STYLE[member.role]} cursor-pointer disabled:opacity-50`}
                  >
                    <option value="superadmin">Super Admin</option>
                    <option value="hr">HR（人事）</option>
                    <option value="admin">管理者</option>
                  </select>
                ) : (
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${ROLE_BADGE_STYLE[member.role]}`}>
                    {ROLE_LABEL[member.role]}
                  </span>
                )}
                {/* 承認ボタン（superadminのみ・承認待ちのみ） */}
                {sessionRole === 'superadmin' && member.authMethod === 'idpass' && member.status === 'pending_approval' && (
                  <Button
                    variant="filled"
                    size="sm"
                    disabled={approvingId === member.id}
                    loading={approvingId === member.id}
                    onClick={() => handleApprove(member.id, member.name)}
                  >
                    承認
                  </Button>
                )}
                {member.authMethod !== 'idpass' && (
                  <Button
                    variant="text"
                    size="sm"
                    disabled={resettingId === member.id || deletingId === member.id}
                    loading={resettingId === member.id}
                    onClick={() => setResetTarget({ id: member.id, name: member.name, email: member.email || '' })}
                  >
                    PW再発行
                  </Button>
                )}
                {canManageRoles && (
                  <Button
                    variant="text"
                    size="sm"
                    danger
                    disabled={deletingId === member.id || resettingId === member.id}
                    loading={deletingId === member.id}
                    onClick={() => setDeleteTarget({ id: member.id, name: member.name })}
                  >
                    削除
                  </Button>
                )}
              </div>
            ))
          ) : (
            <EmptyState
              title="他のメンバーはいません"
              description="「メンバー追加」からアカウントを発行できます"
            />
          )}
        </Card>
      </div>

      {/* CSVインポートモーダル */}
      <Modal
        open={importOpen}
        onClose={() => { if (!importing) setImportOpen(false) }}
        title="メンバーをCSVインポート"
        size="lg"
        footer={
          <>
            {importResult && (
              <Button variant="text" onClick={() => { setImportResult(null); setImportError('') }}>
                続けてインポート
              </Button>
            )}
            <Button variant="filled" disabled={importing} onClick={() => setImportOpen(false)}>
              閉じる
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
            CSVファイルから管理者メンバーを一括で登録できます。
            <strong className="text-[var(--md-sys-color-on-surface)]">メールアドレス</strong>を入れた行はメール招待、
            <strong className="text-[var(--md-sys-color-on-surface)]">ログインID</strong>を入れた行はID＋パスワード方式で作成されます。
          </p>

          <a
            href="/api/admin/members/import"
            download="admin-members-import-template.csv"
            className="inline-flex items-center gap-1.5 text-sm font-medium px-3.5 h-9 rounded-full border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
            </svg>
            サンプルCSVをダウンロード
          </a>

          <div className="bg-[var(--md-sys-color-surface-container-low)] rounded-lg p-3 text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed space-y-1">
            <p className="font-semibold text-[var(--md-sys-color-on-surface)]">CSVの列</p>
            <p>・<strong>氏名</strong>（必須）</p>
            <p>・<strong>メールアドレス</strong> または <strong>ログインID</strong>（どちらか一方を入力。両方入れた行はエラー）</p>
            <p>・<strong>ロール</strong>（空欄は「管理者」。管理者 / Super Admin / HR（人事））</p>
            <p className="pt-1">ログインID方式は 4〜50文字の半角英数字と <code>. _ -</code>。Super Admin は指定できません（本人のパスキー登録＋superadminの承認が必要）。</p>
            <p>初期パスワードは行ごとに自動生成し、この画面で一度だけ表示します。すでに登録済みのメール・ログインIDの行はスキップします。</p>
          </div>

          {!importResult && (
            <>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={importSendEmail}
                  onChange={e => setImportSendEmail(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[var(--portal-primary,#374151)]"
                />
                <span className="text-sm text-[var(--md-sys-color-on-surface)]">
                  招待メールを送信する
                  <span className="block text-xs text-[var(--md-sys-color-on-surface-variant)]">
                    メールアドレスの行に、ログイン情報を記載した招待メールを送ります。オフにすると送信せず、初期パスワードをこの画面から手渡せます。
                  </span>
                </span>
              </label>

              <label
                className={`flex items-center justify-center gap-2 py-6 px-4 rounded-xl border-2 border-dashed border-[var(--md-sys-color-outline-variant)] text-sm text-[var(--md-sys-color-on-surface-variant)] transition-colors ${
                  importing ? 'opacity-60 cursor-wait' : 'cursor-pointer hover:bg-[var(--md-sys-color-surface-container-low)]'
                }`}
              >
                {importing ? 'インポート中…' : 'CSVファイルを選択'}
                <input
                  type="file"
                  accept=".csv,text/csv"
                  hidden
                  disabled={importing}
                  onChange={e => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    if (f) handleImport(f)
                  }}
                />
              </label>
            </>
          )}

          {importError && (
            <MessageBanner severity="error" autoHideSeconds={0}>{importError}</MessageBanner>
          )}

          {importResult && (
            <div className="space-y-3">
              <MessageBanner severity={importResult.created > 0 ? 'success' : 'warning'} autoHideSeconds={0}>
                {importResult.created}件のメンバーを登録しました
                {importResult.errors.length > 0 && `（${importResult.errors.length}件はエラーでスキップ）`}
              </MessageBanner>

              {importResult.results.length > 0 && (
                <div className="border border-[var(--md-sys-color-outline-variant)] rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-3 py-2 bg-[var(--md-sys-color-surface-container-low)]">
                    <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">
                      発行したログイン情報（この画面を閉じると再表示できません）
                    </p>
                    <button
                      type="button"
                      onClick={copyImportedCredentials}
                      className="text-xs font-medium px-2.5 py-1 rounded-full border border-[var(--md-sys-color-outline)] text-[var(--md-sys-color-on-surface)] hover:bg-[var(--md-sys-color-surface-container-high)] transition-colors whitespace-nowrap"
                    >
                      {importListCopied ? 'コピーしました' : '一覧をコピー'}
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-[var(--md-sys-color-on-surface-variant)]">
                          <th className="text-left font-medium px-3 py-1.5">氏名</th>
                          <th className="text-left font-medium px-3 py-1.5">メール / ID</th>
                          <th className="text-left font-medium px-3 py-1.5">ロール</th>
                          <th className="text-left font-medium px-3 py-1.5">初期パスワード</th>
                          <th className="text-left font-medium px-3 py-1.5">メール</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResult.results.map(r => (
                          <tr key={r.row} className="border-t border-[var(--md-sys-color-outline-variant)]">
                            <td className="px-3 py-1.5 text-[var(--md-sys-color-on-surface)]">{r.name}</td>
                            <td className="px-3 py-1.5 font-mono text-[var(--md-sys-color-on-surface-variant)] break-all">
                              {r.email ?? r.loginId}
                            </td>
                            <td className="px-3 py-1.5 text-[var(--md-sys-color-on-surface-variant)]">{ROLE_LABEL[r.role]}</td>
                            <td className="px-3 py-1.5 font-mono text-[var(--md-sys-color-on-surface)] break-all">{r.password}</td>
                            <td className="px-3 py-1.5 text-[var(--md-sys-color-on-surface-variant)] whitespace-nowrap">
                              {r.authMethod === 'idpass' ? '—' : r.emailSent ? '送信済み' : '未送信'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {importResult.errors.length > 0 && (
                <div className="border border-[var(--md-sys-color-outline-variant)] rounded-lg p-3 max-h-48 overflow-y-auto space-y-1">
                  <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface)]">エラー詳細</p>
                  {importResult.errors.map((e, i) => (
                    <p key={i} className="text-xs text-[var(--md-sys-color-error)]">
                      {e.row}行目: {e.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* メンバー追加モーダル */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); resetForm() }}
        title="メンバー追加"
        size="sm"
        footer={
          <>
            <Button
              variant="text"
              onClick={() => { setShowForm(false); resetForm() }}
            >
              キャンセル
            </Button>
            <Button
              variant="filled"
              type="submit"
              loading={saving}
              onClick={() => {
                const fakeEvent = { preventDefault: () => {} } as React.FormEvent
                handleAdd(fakeEvent)
              }}
            >
              {inviteMethod === 'idpass' ? 'ID・パスワードを発行' : '招待メールを送信'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleAdd} className="space-y-4">
          {/* 招待方式トグル */}
          <div>
            <span className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1.5">招待方法</span>
            <div className="grid grid-cols-2 gap-2">
              {([
                { v: 'email', label: 'メールで招待' },
                { v: 'idpass', label: 'ID・パスワードを発行' },
              ] as const).map(opt => (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setInviteMethod(opt.v)}
                  className={`text-sm font-medium px-3 py-2 rounded-lg border transition-colors ${
                    inviteMethod === opt.v
                      ? 'border-[var(--portal-primary,#374151)] bg-[color-mix(in_srgb,var(--portal-primary,#374151)_12%,transparent)] text-[var(--md-sys-color-on-surface)]'
                      : 'border-[var(--md-sys-color-outline-variant)] text-[var(--md-sys-color-on-surface-variant)] hover:bg-[var(--md-sys-color-surface-container-low)]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <TextField
            label="氏名"
            value={form.name}
            onChange={(v) => setForm({ ...form, name: v })}
            required
            placeholder="例：田中 次郎"
          />

          {inviteMethod === 'email' ? (
            <>
              <TextField
                label="メールアドレス"
                value={form.email}
                onChange={(v) => setForm({ ...form, email: v })}
                type="email"
                required
                placeholder="例：tanaka@kaikuru.jp"
              />
              <div className="bg-[var(--md-sys-color-surface-container-low)] rounded-lg p-3 flex gap-3 items-start">
                <svg className="w-5 h-5 text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
                  パスワードは自動生成され、入力されたメールアドレスにログイン情報が送信されます。
                </p>
              </div>
            </>
          ) : (
            <>
              <TextField
                label="ログインID"
                value={loginId}
                onChange={setLoginId}
                required
                placeholder="例：tanaka_jiro（半角英数字と . _ -）"
              />
              <div>
                <label className="block text-xs font-medium text-[var(--md-sys-color-on-surface-variant)] mb-1">ロール</label>
                <select
                  value={idpassRole}
                  onChange={e => setIdpassRole(e.target.value as 'admin' | 'hr')}
                  className="w-full h-10 px-3 text-sm bg-[var(--md-sys-color-surface-container-lowest,#fff)] border border-[var(--md-sys-color-outline)] rounded-[var(--md-sys-shape-small)] text-[var(--md-sys-color-on-surface)] focus:outline-none focus:border-[var(--portal-primary,#374151)] focus:border-2"
                >
                  <option value="admin">管理者</option>
                  <option value="hr">HR（人事）</option>
                </select>
              </div>
              <div className="bg-[var(--md-sys-color-surface-container-low)] rounded-lg p-3 flex gap-3 items-start">
                <svg className="w-5 h-5 text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] leading-relaxed">
                  メール不要。初期パスワードを発行して本人へ手渡します。本人は初回ログイン後に<strong>パスキー登録が必須</strong>で、その後<strong>superadminの承認</strong>を経て利用開始できます。
                </p>
              </div>
            </>
          )}
        </form>
      </Modal>

      {/* ID・パスワード発行 結果モーダル（一度だけ表示） */}
      <Modal
        open={!!idpassResult}
        onClose={() => { setIdpassResult(null); setIdCopied(false); setIdPwCopied(false) }}
        title="ログイン情報を発行しました"
        size="sm"
        footer={
          <Button variant="filled" onClick={() => { setIdpassResult(null); setIdCopied(false); setIdPwCopied(false) }}>
            閉じる
          </Button>
        }
      >
        {idpassResult && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--md-sys-color-on-surface)]">
              <span className="font-semibold">{idpassResult.name}</span> さんのログイン情報です。本人にお伝えください。
            </p>
            <div className="bg-[var(--md-sys-color-surface-container-high)] rounded-lg p-3">
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1.5">ログインID</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-base font-semibold text-[var(--md-sys-color-on-surface)] break-all">{idpassResult.loginId}</code>
                <Button variant="outlined" size="sm" onClick={() => { navigator.clipboard.writeText(idpassResult.loginId); setIdCopied(true); setTimeout(() => setIdCopied(false), 2000) }}>
                  {idCopied ? 'コピー済' : 'コピー'}
                </Button>
              </div>
            </div>
            <div className="bg-[var(--md-sys-color-surface-container-high)] rounded-lg p-3">
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1.5">初期パスワード</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-base font-semibold text-[var(--md-sys-color-on-surface)] break-all">{idpassResult.password}</code>
                <Button variant="outlined" size="sm" onClick={() => { navigator.clipboard.writeText(idpassResult.password); setIdPwCopied(true); setTimeout(() => setIdPwCopied(false), 2000) }}>
                  {idPwCopied ? 'コピー済' : 'コピー'}
                </Button>
              </div>
            </div>
            <p className="text-xs text-[var(--md-sys-color-error)]">
              ⚠ この初期パスワードは一度しか表示されません。初回ログイン後のパスキー登録用です（登録後はパスキー必須）。
            </p>
          </div>
        )}
      </Modal>

      {/* 削除確認モーダル */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="メンバー削除の確認"
        size="sm"
        footer={
          <>
            <Button variant="text" onClick={() => setDeleteTarget(null)}>
              キャンセル
            </Button>
            <Button
              variant="filled"
              danger
              loading={!!deletingId}
              onClick={() => {
                if (deleteTarget) handleDelete(deleteTarget.id, deleteTarget.name)
              }}
            >
              削除する
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--md-sys-color-on-surface)]">
          <span className="font-semibold">{deleteTarget?.name}</span> さんのアカウントを削除しますか？
        </p>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-2">
          この操作は取り消せません。
        </p>
      </Modal>

      {/* PW再発行 確認モーダル */}
      <Modal
        open={!!resetTarget}
        onClose={() => setResetTarget(null)}
        title="パスワード再発行の確認"
        size="sm"
        footer={
          <>
            <Button variant="text" onClick={() => setResetTarget(null)}>
              キャンセル
            </Button>
            <Button
              variant="filled"
              loading={!!resettingId}
              onClick={() => {
                if (resetTarget) handleResetPassword(resetTarget.id, resetTarget.name)
              }}
            >
              再発行する
            </Button>
          </>
        }
      >
        <p className="text-sm text-[var(--md-sys-color-on-surface)]">
          <span className="font-semibold">{resetTarget?.name}</span> さんのパスワードを再発行しますか？
        </p>
        <p className="text-sm text-[var(--md-sys-color-on-surface-variant)] mt-2">
          現在のパスワードは無効になります。新しいパスワードは <span className="font-mono">{resetTarget?.email}</span> 宛にメール送信されます。
        </p>
      </Modal>

      {/* PW再発行 結果モーダル */}
      <Modal
        open={!!resetResult}
        onClose={() => { setResetResult(null); setPwCopied(false) }}
        title="パスワードを再発行しました"
        size="sm"
        footer={
          <Button variant="filled" onClick={() => { setResetResult(null); setPwCopied(false) }}>
            閉じる
          </Button>
        }
      >
        {resetResult && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--md-sys-color-on-surface)]">
              <span className="font-semibold">{resetResult.name}</span> さんのパスワードを再発行しました。
            </p>
            <div className="bg-[var(--md-sys-color-surface-container-high)] rounded-lg p-3">
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-1.5">新しいログインパスワード</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-base font-semibold text-[var(--md-sys-color-on-surface)] break-all">
                  {resetResult.password}
                </code>
                <Button variant="outlined" size="sm" onClick={copyPassword}>
                  {pwCopied ? 'コピー済' : 'コピー'}
                </Button>
              </div>
            </div>
            <div className={`rounded-lg p-3 text-xs ${
              resetResult.emailSent
                ? 'bg-[var(--status-completed-bg)] text-[var(--status-completed-text)]'
                : 'bg-[var(--status-pending-bg)] text-[var(--status-pending-text)]'
            }`}>
              {resetResult.emailSent
                ? `✓ ${resetResult.email} 宛にメールを送信しました`
                : `⚠ メール送信に失敗しました。上記パスワードを ${resetResult.email} に直接お伝えください`}
            </div>
            <p className="text-xs text-[var(--md-sys-color-error)]">
              ⚠ このパスワードは一度しか表示されません。必ず控えてから閉じてください。
            </p>
          </div>
        )}
      </Modal>
    </>
  )
}
