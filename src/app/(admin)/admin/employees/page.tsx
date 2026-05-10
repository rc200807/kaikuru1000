'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import LoadingSpinner from '@/components/LoadingSpinner'

type Employee = {
  id: string
  employeeNumber: string
  lastName: string
  firstName: string
  department: string | null
  jobTitle: string | null
  employmentType: string | null
  workEmail: string | null
  workPhone: string | null
  hireDate: string | null
  resignDate: string | null
  profilePhotoDriveUrl: string | null
}

export default function EmployeeListPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const role = (session?.user as any)?.role as string | undefined
  const canEdit = role === 'superadmin' || role === 'hr'

  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showResigned, setShowResigned] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/admin/login')
  }, [status, router])

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/admin/employees')
      .then(r => (r.ok ? r.json() : []))
      .then(setEmployees)
      .finally(() => setLoading(false))
  }, [status])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = employees
    if (!showResigned) list = list.filter(e => !e.resignDate)
    if (q) {
      list = list.filter(e =>
        [e.employeeNumber, e.lastName, e.firstName, e.department ?? '', e.jobTitle ?? '', e.workEmail ?? '']
          .join(' ').toLowerCase().includes(q)
      )
    }
    return list
  }, [employees, search, showResigned])

  if (status === 'loading' || loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><LoadingSpinner /></div>
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1280, margin: '0 auto', color: 'var(--md-sys-color-on-surface)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 24, fontWeight: 700 }}>社員情報</h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--md-sys-color-on-surface-variant)' }}>
            {role === 'admin'
              ? '※ 機微情報は閲覧できません（基本情報のみ表示）'
              : '社員の基本情報・人事情報・機微情報を管理'}
            （{filtered.length}件 / 全{employees.length}件）
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => router.push('/admin/employees/new')}
            style={{ padding: '10px 16px', borderRadius: 8, background: 'var(--md-sys-color-primary)', color: 'var(--md-sys-color-on-primary)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            + 社員を追加
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <input
          type="search"
          placeholder="従業員番号・氏名・部署で検索"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: '1 1 240px', maxWidth: 360, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--md-sys-color-outline-variant)', background: 'var(--md-sys-color-surface-container)', color: 'var(--md-sys-color-on-surface)' }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <input type="checkbox" checked={showResigned} onChange={e => setShowResigned(e.target.checked)} />
          退職者を表示
        </label>
      </div>

      <div style={{ background: 'var(--md-sys-color-surface-container-low)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--md-sys-color-outline-variant)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: 'var(--md-sys-color-surface-container)', textAlign: 'left' }}>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>従業員番号</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>氏名</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>部署</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>肩書き</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>雇用形態</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>社用連絡先</th>
              <th style={{ padding: '12px 16px', fontWeight: 600 }}>状態</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--md-sys-color-on-surface-variant)' }}>社員が登録されていません</td></tr>
            )}
            {filtered.map(e => (
              <tr
                key={e.id}
                onClick={() => router.push(`/admin/employees/${e.id}`)}
                style={{ borderTop: '1px solid var(--md-sys-color-outline-variant)', cursor: 'pointer' }}
              >
                <td style={{ padding: '12px 16px', fontFamily: 'monospace' }}>{e.employeeNumber}</td>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{e.lastName} {e.firstName}</td>
                <td style={{ padding: '12px 16px' }}>{e.department ?? '—'}</td>
                <td style={{ padding: '12px 16px' }}>{e.jobTitle ?? '—'}</td>
                <td style={{ padding: '12px 16px' }}>{e.employmentType ?? '—'}</td>
                <td style={{ padding: '12px 16px', fontSize: 12 }}>
                  {e.workEmail && <div>{e.workEmail}</div>}
                  {e.workPhone && <div>{e.workPhone}</div>}
                  {!e.workEmail && !e.workPhone && '—'}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  {e.resignDate
                    ? <span style={{ padding: '2px 8px', borderRadius: 12, background: 'rgba(211, 47, 47, 0.15)', color: '#ef5350', fontSize: 12 }}>退職</span>
                    : <span style={{ padding: '2px 8px', borderRadius: 12, background: 'rgba(46, 125, 50, 0.15)', color: '#66bb6a', fontSize: 12 }}>在籍</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
