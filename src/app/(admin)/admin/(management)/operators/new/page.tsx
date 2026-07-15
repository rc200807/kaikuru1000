'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import LoadingSpinner from '@/components/LoadingSpinner'
import OperatorForm, { INITIAL_FORM, type OperatorFormState } from '@/components/admin/OperatorForm'

export default function OperatorNewPage() {
  const { status } = useSession()
  const router = useRouter()
  const [form, setForm] = useState<OperatorFormState>(INITIAL_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  if (status === 'loading') {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }

  async function handleSave() {
    if (!form.name.trim() || !form.representativeName.trim()) {
      setError('会社名と代表者氏名は必須です')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/operators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          // 個人事業主時は不要フィールドを送らない（API側でも null 化される）
          corporatePrefix: form.entityType === 'corporation' ? form.corporatePrefix : null,
          email: form.email || null,
          address: form.address || null,
          representativeNameKana: form.representativeNameKana || null,
          corporateNumber: form.corporateNumber || null,
          invoiceNumber: form.invoiceNumber || null,
          phone: form.phone || null,
          antiquePermitNumber: form.antiquePermitNumber || null,
          antiqueOfficeAddress: form.antiqueOfficeAddress || null,
          antiqueLicenseHolder: form.antiqueLicenseHolder || null,
          publicSafetyCommission: form.publicSafetyCommission || null,
          service: form.service || null,
          bankName: form.bankName || null,
          branchName: form.branchName || null,
          accountType: form.accountType || null,
          accountNumber: form.accountNumber || null,
          accountHolder: form.accountHolder || null,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error ?? '作成に失敗しました')
        return
      }
      const created = await res.json()
      router.push(`/admin/operators/${created.id}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 880, margin: '0 auto', color: 'var(--md-sys-color-on-surface)' }}>
      <div style={{ marginBottom: 16, fontSize: 13 }}>
        <Link href="/admin/operators" style={{ color: '#4f8ef7', textDecoration: 'none' }}>← 運営者一覧</Link>
      </div>

      <h1 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 700 }}>運営者を新規追加</h1>

      <OperatorForm value={form} onChange={setForm} />

      {error && (
        <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 8, background: 'rgba(248,113,113,0.15)', color: '#f87171', fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 24 }}>
        <button
          onClick={() => router.push('/admin/operators')}
          disabled={saving}
          style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', cursor: 'pointer', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
        >
          キャンセル
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !form.name.trim() || !form.representativeName.trim()}
          style={{ padding: '8px 22px', borderRadius: 8, border: 'none', cursor: saving ? 'wait' : 'pointer', background: '#4f8ef7', color: '#fff', fontSize: 13, fontWeight: 700, opacity: (saving || !form.name.trim() || !form.representativeName.trim()) ? 0.6 : 1 }}
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  )
}
