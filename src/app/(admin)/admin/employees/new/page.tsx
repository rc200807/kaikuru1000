'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'
import EmployeeForm, { EMPTY_EMPLOYEE, EmployeeFormState, buildEmployeePayload } from '@/components/admin/EmployeeForm'

export default function NewEmployeePage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role as string | undefined
  const canSensitive = role === 'superadmin' || role === 'hr'
  const canEdit = canSensitive

  const [form, setForm] = useState<EmployeeFormState>(EMPTY_EMPLOYEE)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
    else if (status === 'authenticated' && !canEdit) router.push('/admin/employees')
  }, [status, canEdit, router])

  async function handleSave() {
    setError('')
    if (!form.employeeNumber.trim() || !form.lastName.trim() || !form.firstName.trim()) {
      setError('従業員番号・苗字・名前は必須です')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildEmployeePayload(form, canSensitive)),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error ?? '登録に失敗しました')
        return
      }
      const created = await res.json()
      router.push(`/admin/employees/${created.id}`)
    } finally {
      setSaving(false)
    }
  }

  if (status !== 'authenticated' || !canEdit) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 960, margin: '0 auto', color: 'var(--md-sys-color-on-surface)' }}>
      <button onClick={() => router.push('/admin/employees')} style={{ background: 'transparent', border: 'none', color: 'var(--md-sys-color-primary)', cursor: 'pointer', marginBottom: 12, padding: 0 }}>
        ← 一覧に戻る
      </button>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 16px' }}>社員を追加</h1>
      {error && <p style={{ color: 'var(--md-sys-color-error)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <EmployeeForm value={form} onChange={setForm} showSensitive={canSensitive} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={() => router.push('/admin/employees')} style={{ padding: '8px 16px', borderRadius: 6, background: 'transparent', color: 'var(--md-sys-color-on-surface)', border: '1px solid var(--md-sys-color-outline)', fontSize: 14, cursor: 'pointer' }}>キャンセル</button>
        <button onClick={handleSave} disabled={saving} style={{ padding: '8px 16px', borderRadius: 6, background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
          {saving ? '保存中…' : '登録'}
        </button>
      </div>
    </div>
  )
}
