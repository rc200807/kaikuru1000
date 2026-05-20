'use client'

import { useEffect, useState, use as usePromise } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmployeeForm, { EMPTY_EMPLOYEE, EmployeeFormState, buildEmployeePayload, fromEmployeeApi } from '@/components/admin/EmployeeForm'

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params)
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role as string | undefined
  const canSensitive = role === 'superadmin' || role === 'hr'
  const canEdit = canSensitive
  const canDelete = role === 'superadmin'

  const [form, setForm] = useState<EmployeeFormState>(EMPTY_EMPLOYEE)
  const [savedForm, setSavedForm] = useState<EmployeeFormState>(EMPTY_EMPLOYEE)
  const [editMode, setEditMode] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [internalId, setInternalId] = useState<string>('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch(`/api/admin/employees/${id}`)
      .then(r => (r.ok ? r.json() : null))
      .then(api => {
        if (api) {
          setInternalId(api.id)
          const next = fromEmployeeApi(api)
          setForm(next)
          setSavedForm(next)
        }
      })
      .finally(() => setLoading(false))
  }, [status, id])

  function flash(kind: 'success' | 'error', text: string) {
    setMsg({ kind, text })
    setTimeout(() => setMsg(null), 3000)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/employees/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildEmployeePayload(form, canSensitive)),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        flash('error', j.error ?? '保存に失敗しました')
        return
      }
      flash('success', '保存しました')
      setSavedForm(form)
      setEditMode(false)
    } finally {
      setSaving(false)
    }
  }

  function handleCancelEdit() {
    setForm(savedForm)
    setEditMode(false)
    setMsg(null)
  }

  async function handleDelete() {
    if (!confirm('この社員情報を削除しますか？復元できません。')) return
    const res = await fetch(`/api/admin/employees/${id}`, { method: 'DELETE' })
    if (res.ok) router.push('/admin/employees')
  }

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }
  if (!internalId) {
    return <div style={{ padding: 40, textAlign: 'center' }}>社員が見つかりません</div>
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 960, margin: '0 auto', color: 'var(--md-sys-color-on-surface)' }}>
      <button onClick={() => router.push('/admin/employees')} style={{ background: 'transparent', border: 'none', color: 'var(--md-sys-color-primary)', cursor: 'pointer', marginBottom: 12, padding: 0 }}>
        ← 一覧に戻る
      </button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{savedForm.lastName} {savedForm.firstName}</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <code style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)' }}>社員ID: {internalId}</code>
          {canEdit && !editMode && (
            <button
              onClick={() => setEditMode(true)}
              style={{ padding: '8px 16px', borderRadius: 6, background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              編集
            </button>
          )}
        </div>
      </div>

      {!canSensitive && (
        <div style={{ padding: 10, borderRadius: 8, marginBottom: 16, background: 'rgba(255, 152, 0, 0.15)', color: '#ffa726', fontSize: 13 }}>
          機微情報の閲覧権限がありません。基本情報・雇用情報のみ表示されます。
        </div>
      )}
      {msg && (
        <div style={{ padding: 10, borderRadius: 8, marginBottom: 16, background: msg.kind === 'success' ? 'rgba(46, 125, 50, 0.15)' : 'rgba(211, 47, 47, 0.15)', color: msg.kind === 'success' ? '#66bb6a' : '#ef5350', fontSize: 13 }}>
          {msg.text}
        </div>
      )}

      <EmployeeForm value={form} onChange={setForm} showSensitive={canSensitive} disabled={!editMode} />

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <div>
          {canDelete && !editMode && (
            <button onClick={handleDelete} style={{ padding: '8px 16px', borderRadius: 6, background: 'var(--md-sys-color-error)', color: 'var(--md-sys-color-on-error)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              削除
            </button>
          )}
        </div>
        {canEdit && editMode && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={handleCancelEdit}
              disabled={saving}
              style={{ padding: '8px 16px', borderRadius: 6, background: 'transparent', color: 'var(--md-sys-color-on-surface)', border: '1px solid var(--md-sys-color-outline)', fontSize: 14, fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '8px 16px', borderRadius: 6, background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', border: 'none', fontSize: 14, fontWeight: 600, cursor: saving ? 'wait' : 'pointer' }}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
