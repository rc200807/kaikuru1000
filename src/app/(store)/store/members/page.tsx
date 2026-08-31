'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AppBar from '@/components/AppBar'
import Button from '@/components/Button'
import Card from '@/components/Card'
import Modal from '@/components/Modal'
import TextField from '@/components/TextField'
import MessageBanner from '@/components/MessageBanner'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmptyState from '@/components/EmptyState'
import ImageCropper from '@/components/ImageCropper'
import { appendImageToFormData } from '@/lib/image-utils'

type Member = {
  id: string
  name: string
  email: string
  avatar: string | null
  createdAt: string
}

/** 顔写真の丸表示（なければ頭文字） */
function MemberAvatar({ name, avatar, size = 40 }: { name: string; avatar: string | null; size?: number }) {
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img loading="lazy" decoding="async" src={avatar} alt={name} style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover' }} className="flex-shrink-0" />
  }
  return (
    <div
      style={{ width: size, height: size }}
      className="rounded-full bg-[var(--md-sys-color-surface-container-high)] flex items-center justify-center flex-shrink-0"
    >
      <span className="text-[var(--md-sys-color-on-surface-variant)] font-bold" style={{ fontSize: size * 0.4 }}>{name?.[0] ?? '?'}</span>
    </div>
  )
}

export default function StoreMembersPage() {
  const { data: session, status, update } = useSession()
  const router = useRouter()
  const sessionUser = session?.user as any
  const isOwner = !sessionUser?.memberId
  const myMemberId: string | null = sessionUser?.memberId ?? null

  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', email: '' })
  const [addCropSrc, setAddCropSrc] = useState<File | null>(null)   // トリミング対象の生ファイル
  const [addAvatarFile, setAddAvatarFile] = useState<File | null>(null) // トリミング済みファイル
  const [addAvatarPreview, setAddAvatarPreview] = useState<string | null>(null)
  const addFileRef = useRef<HTMLInputElement>(null)
  const [passwordResult, setPasswordResult] = useState<{ name: string; email: string; password: string } | null>(null)
  const [pwCopied, setPwCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)

  // 編集モーダル
  const [editTarget, setEditTarget] = useState<Member | null>(null)
  const [editForm, setEditForm] = useState({ name: '', email: '', password: '' })
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null)
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const editFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/store/login')
  }, [status, router])

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/store/members')
        .then(r => r.json())
        .then(data => {
          setMembers(Array.isArray(data) ? data : [])
          setLoading(false)
        })
        .catch(() => setLoading(false))
    }
  }, [status])

  function resetAddForm() {
    setForm({ name: '', email: '' })
    setAddCropSrc(null)
    setAddAvatarFile(null)
    setAddAvatarPreview(null)
  }

  function handleAddFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) setAddCropSrc(f) // クロップUIを開く
    if (addFileRef.current) addFileRef.current.value = ''
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)
    // パスワードは自動生成（body に password を送らない）
    const res = await fetch('/api/store/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: form.name, email: form.email }),
    })
    if (!res.ok) {
      setSaving(false)
      const d = await res.json().catch(() => ({}))
      setMessage({ type: 'error', text: d.error || 'アカウントの作成に失敗しました' })
      return
    }
    const created = await res.json()
    // 顔写真があればアップロード
    let avatar: string | null = created.avatar ?? null
    if (addAvatarFile) {
      try {
        const fd = new FormData()
        await appendImageToFormData(fd, 'avatar', addAvatarFile, { maxDimension: 1024 })
        const up = await fetch(`/api/store/members/${created.id}`, { method: 'PATCH', body: fd })
        if (up.ok) { const u = await up.json(); avatar = u.avatar ?? avatar }
      } catch { /* 写真アップロード失敗は致命的ではない */ }
    }
    setSaving(false)
    setMembers(prev => [...prev, { id: created.id, name: created.name, email: created.email, avatar, createdAt: created.createdAt }])
    setPasswordResult({ name: created.name, email: created.email, password: created.password })
    setShowForm(false)
    resetAddForm()
  }

  async function handleDelete(id: string, name: string) {
    setDeletingId(id)
    const res = await fetch(`/api/store/members/${id}`, { method: 'DELETE' })
    setDeletingId(null)
    setDeleteTarget(null)
    if (res.ok) {
      setMembers(prev => prev.filter(m => m.id !== id))
      setMessage({ type: 'success', text: `${name} さんのアカウントを削除しました` })
    } else {
      const d = await res.json()
      setMessage({ type: 'error', text: d.error || '削除に失敗しました' })
    }
  }

  function openEdit(member: Member) {
    setEditTarget(member)
    setEditForm({ name: member.name, email: member.email, password: '' })
    setEditAvatarFile(null)
    setEditAvatarPreview(member.avatar)
    setMessage(null)
  }

  function handleEditAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setEditAvatarFile(file)
    const reader = new FileReader()
    reader.onload = ev => setEditAvatarPreview(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!editTarget) return
    setEditSaving(true)
    setMessage(null)
    const fd = new FormData()
    if (editForm.name) fd.append('name', editForm.name)
    if (isOwner && editForm.email) fd.append('email', editForm.email)
    if (editForm.password) fd.append('password', editForm.password)
    if (editAvatarFile) await appendImageToFormData(fd, 'avatar', editAvatarFile, { maxDimension: 1024 })

    const res = await fetch(`/api/store/members/${editTarget.id}`, { method: 'PATCH', body: fd })
    setEditSaving(false)
    if (res.ok) {
      const updated = await res.json()
      setMembers(prev => prev.map(m => (m.id === updated.id ? { ...m, ...updated } : m)))
      // 自分自身を編集した場合はセッションの氏名・アバターも更新
      if (myMemberId && myMemberId === updated.id) {
        await update({ name: updated.name, avatar: updated.avatar })
      }
      setMessage({ type: 'success', text: `${updated.name} さんの情報を更新しました` })
      setEditTarget(null)
    } else {
      const d = await res.json()
      setMessage({ type: 'error', text: d.error || '更新に失敗しました' })
    }
  }

  const canEdit = (member: Member) => isOwner || member.id === myMemberId

  if (status === 'loading' || loading) {
    return <LoadingSpinner size="lg" fullPage label="読み込み中..." />
  }

  return (
    <>
      <AppBar
        title="メンバー管理"
        subtitle="店舗ポータルにログインできるアカウント"
        actions={
          (
            <Button onClick={() => { setShowForm(true); setMessage(null) }} size="sm">
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
                </svg>
                メンバー追加
              </span>
            </Button>
          )
        }
      />

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {message && (
          <MessageBanner severity={message.type} dismissible onDismiss={() => setMessage(null)} className="mb-6">
            {message.text}
          </MessageBanner>
        )}

        {!isOwner && (
          <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] mb-4">
            メンバーの追加はどなたでも行えます。編集できるのはご自身の顔写真・氏名・パスワードのみで、メンバーの削除と他のメンバーの編集はオーナーのみ可能です。
          </p>
        )}

        <Card variant="outlined" padding="none">
          {/* 店舗アカウント（オーナー） */}
          <div className="px-4 sm:px-6 py-3 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
            <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide">店舗アカウント（オーナー）</p>
          </div>
          <div className="px-4 sm:px-6 py-4 flex items-center gap-4 border-b border-[var(--md-sys-color-surface-container-high)]">
            <div className="w-10 h-10 bg-[var(--status-scheduled-bg)] rounded-full flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-[var(--portal-primary)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--md-sys-color-on-surface)]">{isOwner ? sessionUser?.name : '店舗オーナー'}</p>
              <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{isOwner ? sessionUser?.email : ''}</p>
            </div>
            <span className="text-xs font-medium bg-[var(--status-scheduled-bg)] text-[var(--portal-primary)] px-2.5 py-1 rounded-full flex-shrink-0">
              オーナー
            </span>
          </div>

          {/* メンバー一覧 */}
          {members.length > 0 && (
            <>
              <div className="px-4 sm:px-6 py-3 border-b border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)]">
                <p className="text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)] uppercase tracking-wide">
                  追加メンバー（{members.length}名）
                </p>
              </div>
              {members.map(member => (
                <div key={member.id} className="px-4 sm:px-6 py-4 flex items-center gap-4 border-b border-[var(--md-sys-color-surface-container-high)] last:border-0 hover:bg-[var(--md-sys-color-surface-container-low)] transition-colors">
                  <MemberAvatar name={member.name} avatar={member.avatar} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--md-sys-color-on-surface)] flex items-center gap-2">
                      {member.name}
                      {member.id === myMemberId && (
                        <span className="text-[10px] font-semibold bg-[var(--status-scheduled-bg)] text-[var(--portal-primary)] px-1.5 py-0.5 rounded-full">あなた</span>
                      )}
                    </p>
                    <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">{member.email}</p>
                  </div>
                  <p className="text-xs text-[var(--md-sys-color-on-surface-variant)] flex-shrink-0 hidden sm:block">
                    {format(new Date(member.createdAt), 'yyyy/M/d 追加', { locale: ja })}
                  </p>
                  {canEdit(member) && (
                    <Button variant="text" size="sm" onClick={() => openEdit(member)}>
                      {member.id === myMemberId && !isOwner ? '写真・情報を編集' : '編集'}
                    </Button>
                  )}
                  {isOwner && (
                    <Button variant="text" size="sm" danger disabled={deletingId === member.id} onClick={() => setDeleteTarget({ id: member.id, name: member.name })}>
                      削除
                    </Button>
                  )}
                </div>
              ))}
            </>
          )}

          {members.length === 0 && (
            <EmptyState
              title="追加メンバーはいません"
              description="「メンバー追加」からアカウントを発行できます"
            />
          )}
        </Card>
      </div>

      {/* メンバー追加モーダル */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); resetAddForm() }}
        title={addCropSrc ? '顔写真をトリミング' : 'メンバー追加'}
        size="sm"
        footer={addCropSrc ? undefined : (
          <>
            <Button variant="text" onClick={() => { setShowForm(false); resetAddForm() }}>キャンセル</Button>
            <Button type="submit" loading={saving} onClick={() => { (document.getElementById('add-member-form') as HTMLFormElement)?.requestSubmit() }}>
              {saving ? '作成中...' : 'アカウント作成'}
            </Button>
          </>
        )}
      >
        {addCropSrc ? (
          <ImageCropper
            file={addCropSrc}
            onCropped={(f, url) => { setAddAvatarFile(f); setAddAvatarPreview(url); setAddCropSrc(null) }}
            onCancel={() => setAddCropSrc(null)}
          />
        ) : (
          <form id="add-member-form" onSubmit={handleAdd} className="space-y-4">
            {/* 顔写真（アップロード→トリミング） */}
            <div className="flex flex-col items-center gap-2">
              <button type="button" onClick={() => addFileRef.current?.click()} className="relative group">
                {addAvatarPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img loading="lazy" decoding="async" src={addAvatarPreview} className="w-20 h-20 rounded-full object-cover border-4 border-[var(--md-sys-color-surface-container-high)]" alt="顔写真" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-[var(--md-sys-color-surface-container-high)] border-4 border-[var(--md-sys-color-outline-variant)] flex items-center justify-center">
                    <svg className="w-7 h-7 text-[var(--md-sys-color-on-surface-variant)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </div>
                )}
              </button>
              <button type="button" onClick={() => addFileRef.current?.click()} className="text-xs font-medium text-[var(--store-primary)]">
                {addAvatarPreview ? '写真を変更' : '顔写真をアップロード（任意）'}
              </button>
              <input ref={addFileRef} type="file" accept="image/*" className="hidden" onChange={handleAddFileSelect} />
            </div>

            <TextField label="氏名" value={form.name} onChange={v => setForm({ ...form, name: v })} required placeholder="例：山田 太郎" />
            <TextField label="メールアドレス" type="email" value={form.email} onChange={v => setForm({ ...form, email: v })} required placeholder="例：yamada@example.com" />
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">パスワードは自動生成されます。作成後に一度だけ表示されますので、メンバーへお伝えください。</p>
          </form>
        )}
      </Modal>

      {/* パスワード発行結果モーダル */}
      <Modal
        open={!!passwordResult}
        onClose={() => { setPasswordResult(null); setPwCopied(false) }}
        title="アカウントを作成しました"
        size="sm"
        footer={<Button onClick={() => { setPasswordResult(null); setPwCopied(false) }}>閉じる</Button>}
      >
        {passwordResult && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--md-sys-color-on-surface)]">
              <strong>{passwordResult.name}</strong> さんのアカウントを作成しました。<br />
              以下の初期パスワードをメンバーへお伝えください。<span className="text-[var(--store-primary)]">この画面を閉じると再表示できません。</span>
            </p>
            <div className="rounded-lg bg-[var(--md-sys-color-surface-container-high)] p-3 space-y-2">
              <div className="text-xs text-[var(--md-sys-color-on-surface-variant)]">メールアドレス</div>
              <div className="text-sm font-medium text-[var(--md-sys-color-on-surface)] break-all">{passwordResult.email}</div>
              <div className="text-xs text-[var(--md-sys-color-on-surface-variant)] pt-1">初期パスワード</div>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-base font-mono font-bold text-[var(--md-sys-color-on-surface)] bg-[var(--md-sys-color-surface-container-highest)] rounded px-3 py-2 break-all">{passwordResult.password}</code>
                <Button
                  size="sm"
                  variant="tonal"
                  onClick={() => { navigator.clipboard?.writeText(passwordResult.password); setPwCopied(true); setTimeout(() => setPwCopied(false), 2000) }}
                >
                  {pwCopied ? 'コピー済' : 'コピー'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* メンバー編集モーダル */}
      <Modal
        open={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={isOwner ? 'メンバー情報を編集' : 'プロフィールを編集'}
        size="sm"
        footer={
          <>
            <Button variant="text" onClick={() => setEditTarget(null)}>キャンセル</Button>
            <Button type="submit" loading={editSaving} onClick={() => { (document.getElementById('edit-member-form') as HTMLFormElement)?.requestSubmit() }}>
              {editSaving ? '保存中...' : '保存する'}
            </Button>
          </>
        }
      >
        <form id="edit-member-form" onSubmit={handleEditSave} className="space-y-5">
          {/* 顔写真 */}
          <div className="flex flex-col items-center gap-2">
            <button type="button" onClick={() => editFileRef.current?.click()} className="relative group">
              {editAvatarPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img loading="lazy" decoding="async" src={editAvatarPreview} className="w-24 h-24 rounded-full object-cover border-4 border-[var(--md-sys-color-surface-container-high)] group-hover:opacity-80 transition-opacity" alt="顔写真" />
              ) : (
                <div className="w-24 h-24 rounded-full bg-[var(--md-sys-color-surface-container-high)] border-4 border-[var(--md-sys-color-outline-variant)] flex items-center justify-center">
                  <span className="text-[var(--portal-primary)] text-3xl font-bold">{editForm.name?.[0] ?? '?'}</span>
                </div>
              )}
              <div className="absolute inset-0 rounded-full flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors">
                <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </button>
            <p className="text-xs text-[var(--md-sys-color-on-surface-variant)]">クリックして顔写真を変更</p>
            <input ref={editFileRef} type="file" accept="image/*" className="hidden" onChange={handleEditAvatarChange} />
          </div>

          <TextField label="氏名" value={editForm.name} onChange={v => setEditForm({ ...editForm, name: v })} />
          <TextField label="メールアドレス" type="email" value={editForm.email} onChange={v => setEditForm({ ...editForm, email: v })} disabled={!isOwner} helper={!isOwner ? 'メールアドレスの変更はオーナーのみ可能です' : undefined} />
          <TextField label="新しいパスワード（任意）" type="password" value={editForm.password} onChange={v => setEditForm({ ...editForm, password: v })} placeholder="8文字以上" helper="変更する場合のみ入力" />
        </form>
      </Modal>

      {/* 削除確認モーダル */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="メンバーの削除"
        size="sm"
        footer={
          <>
            <Button variant="text" onClick={() => setDeleteTarget(null)}>キャンセル</Button>
            <Button danger loading={deletingId === deleteTarget?.id} onClick={() => deleteTarget && handleDelete(deleteTarget.id, deleteTarget.name)}>
              削除する
            </Button>
          </>
        }
      >
        {deleteTarget && (
          <p className="text-sm text-[var(--md-sys-color-on-surface)]">
            <strong>{deleteTarget.name}</strong> さんのアカウントを削除しますか？この操作は取り消せません。
          </p>
        )}
      </Modal>
    </>
  )
}
