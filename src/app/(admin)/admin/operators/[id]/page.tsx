'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import LoadingSpinner from '@/components/LoadingSpinner'
import OperatorForm, { type OperatorFormState } from '@/components/admin/OperatorForm'
import { formalName, type EntityType, type PrefixPosition } from '@/lib/operator-utils'

type StoreLite = { id: string; name: string; code: string; operatorId?: string | null }

type Operator = {
  id: string
  entityType: string
  corporatePrefix: string | null
  prefixPosition: string | null
  name: string
  address: string | null
  representativeName: string
  representativeNameKana: string | null
  corporateNumber: string | null
  invoiceRegistered: boolean
  invoiceNumber: string | null
  phone: string | null
  email: string | null
  contractFilePath: string | null
  contractFileUploadedAt: string | null
  antiquePermitNumber: string | null
  antiqueOfficeAddress: string | null
  antiqueLicenseHolder: string | null
  publicSafetyCommission: string | null
  service: string | null
  stores: StoreLite[]
  updatedAt: string
}

function operatorToForm(op: Operator): OperatorFormState {
  return {
    entityType: (op.entityType === 'sole_proprietor' ? 'sole_proprietor' : 'corporation') as EntityType,
    corporatePrefix: op.corporatePrefix ?? '株式会社',
    prefixPosition: ((op.prefixPosition === 'after' ? 'after' : 'before') as PrefixPosition),
    name: op.name,
    address: op.address ?? '',
    representativeName: op.representativeName,
    representativeNameKana: op.representativeNameKana ?? '',
    corporateNumber: op.corporateNumber ?? '',
    invoiceRegistered: op.invoiceRegistered,
    invoiceNumber: op.invoiceNumber ?? '',
    phone: op.phone ?? '',
    email: op.email ?? '',
    antiquePermitNumber: op.antiquePermitNumber ?? '',
    antiqueOfficeAddress: op.antiqueOfficeAddress ?? '',
    antiqueLicenseHolder: op.antiqueLicenseHolder ?? '',
    publicSafetyCommission: op.publicSafetyCommission ?? '',
    service: op.service ?? '',
  }
}

export default function OperatorDetailPage() {
  const { status } = useSession()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = params.id

  const [operator, setOperator] = useState<Operator | null>(null)
  const [allStores, setAllStores] = useState<StoreLite[]>([])
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set())
  const [form, setForm] = useState<OperatorFormState | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingStores, setSavingStores] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    let cancelled = false
    Promise.all([
      fetch(`/api/admin/operators/${id}`).then(r => r.ok ? r.json() : null),
      fetch('/api/stores').then(r => r.ok ? r.json() : []).then(d => Array.isArray(d) ? d : (d.stores ?? [])),
    ]).then(([op, stores]: [Operator | null, any[]]) => {
      if (cancelled) return
      if (op) {
        setOperator(op)
        setForm(operatorToForm(op))
        setLinkedIds(new Set(op.stores.map((s: StoreLite) => s.id)))
      }
      setAllStores(stores.map((s: any) => ({ id: s.id, name: s.name, code: s.code, operatorId: s.operatorId ?? null })))
    }).finally(() => !cancelled && setLoading(false))
    return () => { cancelled = true }
  }, [status, id])

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }
  if (!operator || !form) {
    return <p style={{ padding: 40, textAlign: 'center' }}>運営者が見つかりません</p>
  }

  function flash(type: 'success' | 'error', text: string) {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  async function handleSaveBasic() {
    if (!form) return
    if (!form.name.trim() || !form.representativeName.trim()) {
      flash('error', '会社名と代表者氏名は必須です')
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/operators/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          corporatePrefix: form.entityType === 'corporation' ? form.corporatePrefix : null,
          prefixPosition: form.entityType === 'corporation' ? form.prefixPosition : null,
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
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        flash('error', j.error ?? '保存に失敗しました')
        return
      }
      const updated = await res.json()
      setOperator(prev => prev ? { ...prev, ...updated } : prev)
      flash('success', '基本情報を更新しました')
    } finally {
      setSaving(false)
    }
  }

  async function handleSaveStores() {
    setSavingStores(true)
    try {
      const res = await fetch(`/api/admin/operators/${id}/stores`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeIds: [...linkedIds] }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        flash('error', j.error ?? '店舗の紐付けに失敗しました')
        return
      }
      const { stores } = await res.json()
      setOperator(prev => prev ? { ...prev, stores } : prev)
      // allStores の operatorId 表示を更新するため再取得
      fetch('/api/stores').then(r => r.ok ? r.json() : []).then(d => {
        const list = Array.isArray(d) ? d : (d.stores ?? [])
        setAllStores(list.map((s: any) => ({ id: s.id, name: s.name, code: s.code, operatorId: s.operatorId ?? null })))
      })
      flash('success', '紐付け店舗を更新しました')
    } finally {
      setSavingStores(false)
    }
  }

  async function handleUploadContract(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`/api/admin/operators/${id}/contract`, { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        flash('error', j.error ?? 'アップロードに失敗しました')
        return
      }
      // 詳細を再取得
      const detail = await fetch(`/api/admin/operators/${id}`).then(r => r.json())
      setOperator(detail)
      flash('success', '契約書をアップロードしました')
    } finally {
      setUploading(false)
    }
  }

  async function handleDeleteContract() {
    if (!confirm('契約書PDFを削除しますか？')) return
    const res = await fetch(`/api/admin/operators/${id}/contract`, { method: 'DELETE' })
    if (!res.ok) {
      flash('error', '削除に失敗しました')
      return
    }
    setOperator(prev => prev ? { ...prev, contractFilePath: null, contractFileUploadedAt: null } : prev)
    flash('success', '契約書を削除しました')
  }

  async function handleDeleteOperator() {
    if (!operator) return
    if (!confirm(`「${formalName(operator)}」を削除しますか？\n紐付けされた店舗はリンクが解除されます（店舗自体は残ります）。`)) return
    const res = await fetch(`/api/admin/operators/${id}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/admin/operators')
    } else {
      flash('error', '削除に失敗しました')
    }
  }

  const formal = formalName({
    entityType: form.entityType,
    corporatePrefix: form.corporatePrefix,
    prefixPosition: form.prefixPosition,
    name: form.name,
  })

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1000, margin: '0 auto', color: 'var(--md-sys-color-on-surface)' }}>
      <div style={{ marginBottom: 16, fontSize: 13 }}>
        <Link href="/admin/operators" style={{ color: '#4f8ef7', textDecoration: 'none' }}>← 運営者一覧</Link>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 700 }}>{formal || '（名称未設定）'}</h1>
          <div style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
            代表者: {operator.representativeName}
          </div>
        </div>
        <button
          onClick={handleDeleteOperator}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #f87171', cursor: 'pointer', background: 'transparent', color: '#f87171', fontSize: 12, fontWeight: 600 }}
        >
          削除
        </button>
      </div>

      {message && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 8,
          background: message.type === 'success' ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)',
          color: message.type === 'success' ? '#4ade80' : '#f87171',
          fontSize: 13,
        }}>{message.text}</div>
      )}

      {/* 基本情報フォーム */}
      <OperatorForm value={form} onChange={setForm} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button
          onClick={() => setForm(operatorToForm(operator))}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', cursor: 'pointer', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
        >
          リセット
        </button>
        <button
          onClick={handleSaveBasic}
          disabled={saving || !form.name.trim() || !form.representativeName.trim()}
          style={{ padding: '8px 22px', borderRadius: 8, border: 'none', cursor: saving ? 'wait' : 'pointer', background: '#4f8ef7', color: '#fff', fontSize: 13, fontWeight: 700, opacity: saving ? 0.6 : 1 }}
        >
          {saving ? '保存中…' : '基本情報を保存'}
        </button>
      </div>

      {/* 契約書 */}
      <section style={{ marginTop: 32 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>契約書（PDF）</h3>
        <div style={{ background: 'var(--md-sys-color-surface-container-high)', borderRadius: 12, padding: 16 }}>
          {operator.contractFilePath ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, flex: 1 }}>
                📄 アップロード済み
                {operator.contractFileUploadedAt && (
                  <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>
                    {new Date(operator.contractFileUploadedAt).toLocaleString('ja-JP')}
                  </span>
                )}
              </span>
              <a
                href={operator.contractFilePath}
                target="_blank"
                rel="noreferrer"
                style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', textDecoration: 'none', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
              >
                ダウンロード/表示
              </a>
              <label style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', cursor: uploading ? 'wait' : 'pointer', fontSize: 13, opacity: uploading ? 0.6 : 1 }}>
                差し替え
                <input
                  type="file"
                  accept="application/pdf"
                  hidden
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadContract(f) }}
                />
              </label>
              <button
                onClick={handleDeleteContract}
                style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #f87171', cursor: 'pointer', background: 'transparent', color: '#f87171', fontSize: 13 }}
              >
                削除
              </button>
            </div>
          ) : (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 8, border: '1px dashed var(--md-sys-color-outline)', cursor: uploading ? 'wait' : 'pointer', fontSize: 13, opacity: uploading ? 0.6 : 1 }}>
              {uploading ? 'アップロード中…' : '📎 PDFファイルを選択（最大10MB）'}
              <input
                type="file"
                accept="application/pdf"
                hidden
                onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadContract(f) }}
              />
            </label>
          )}
        </div>
      </section>

      {/* 紐付け店舗 */}
      <section style={{ marginTop: 32 }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>運営店舗（{linkedIds.size}店舗）</h3>
        {allStores.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>店舗がまだ登録されていません。</p>
        ) : (
          <>
            <div style={{ background: 'var(--md-sys-color-surface-container-high)', borderRadius: 12, padding: 12, maxHeight: 320, overflowY: 'auto' }}>
              {allStores.map(s => {
                const checked = linkedIds.has(s.id)
                const linkedToOther = !checked && s.operatorId && s.operatorId !== id
                return (
                  <label key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={e => {
                        const next = new Set(linkedIds)
                        if (e.target.checked) next.add(s.id)
                        else next.delete(s.id)
                        setLinkedIds(next)
                      }}
                    />
                    <span style={{ flex: 1 }}>
                      [{s.code}] {s.name}
                      {linkedToOther && (
                        <span style={{ marginLeft: 8, fontSize: 10, color: '#fbbf24' }}>※ 他の運営者に紐付け中（チェックすると移動します）</span>
                      )}
                    </span>
                  </label>
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => setLinkedIds(new Set(operator.stores.map(s => s.id)))}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline)', cursor: 'pointer', background: 'transparent', color: 'var(--md-sys-color-on-surface)', fontSize: 13 }}
              >
                リセット
              </button>
              <button
                onClick={handleSaveStores}
                disabled={savingStores}
                style={{ padding: '8px 22px', borderRadius: 8, border: 'none', cursor: savingStores ? 'wait' : 'pointer', background: '#4f8ef7', color: '#fff', fontSize: 13, fontWeight: 700, opacity: savingStores ? 0.6 : 1 }}
              >
                {savingStores ? '保存中…' : '紐付けを保存'}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
