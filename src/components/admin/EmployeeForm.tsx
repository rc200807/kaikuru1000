'use client'

import { HIRE_TYPES, EMPLOYMENT_TYPES, RESIGN_TYPES, GENDERS, MARITAL_STATUSES } from '@/lib/employee-utils'

export type EmployeeFormState = {
  employeeNumber: string
  lastName: string
  firstName: string
  lastNameKana: string
  firstNameKana: string
  hireDate: string
  hireType: string
  employmentType: string
  department: string
  jobTitle: string
  jobCategory: string
  jobDescription: string
  resignDate: string
  resignType: string
  gender: string
  workEmail: string
  workPhone: string
  dateOfBirth: string
  address: string
  emergencyContact: string
  personalPhone: string
  basicPensionNumber: string
  healthInsuranceNumber: string
  employmentInsuranceNumber: string
  residenceCardNumber: string
  payrollBankInfo: string
  qualifications: string
  resumeDriveUrl: string
  businessCardDriveUrl: string
  profilePhotoDriveUrl: string
  maritalStatus: string
}

export const EMPTY_EMPLOYEE: EmployeeFormState = {
  employeeNumber: '',
  lastName: '',
  firstName: '',
  lastNameKana: '',
  firstNameKana: '',
  hireDate: '',
  hireType: '',
  employmentType: '',
  department: '',
  jobTitle: '',
  jobCategory: '',
  jobDescription: '',
  resignDate: '',
  resignType: '',
  gender: '',
  workEmail: '',
  workPhone: '',
  dateOfBirth: '',
  address: '',
  emergencyContact: '',
  personalPhone: '',
  basicPensionNumber: '',
  healthInsuranceNumber: '',
  employmentInsuranceNumber: '',
  residenceCardNumber: '',
  payrollBankInfo: '',
  qualifications: '',
  resumeDriveUrl: '',
  businessCardDriveUrl: '',
  profilePhotoDriveUrl: '',
  maritalStatus: '',
}

const inputStyle: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid var(--md-sys-color-outline-variant)',
  background: 'var(--md-sys-color-surface)',
  color: 'var(--md-sys-color-on-surface)',
  fontSize: 14,
  width: '100%',
  boxSizing: 'border-box',
}

const sectionStyle: React.CSSProperties = {
  background: 'var(--md-sys-color-surface-container-low)',
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
  border: '1px solid var(--md-sys-color-outline-variant)',
}

function Field({ label, children, span2 }: { label: string; children: React.ReactNode; span2?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, gridColumn: span2 ? '1 / -1' : undefined }}>
      <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>{label}</span>
      {children}
    </label>
  )
}

type Props = {
  value: EmployeeFormState
  onChange: (next: EmployeeFormState) => void
  showSensitive: boolean
  disabled?: boolean
}

export default function EmployeeForm({ value, onChange, showSensitive, disabled = false }: Props) {
  const set = <K extends keyof EmployeeFormState>(k: K, v: string) => onChange({ ...value, [k]: v })
  const grid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } as React.CSSProperties

  return (
    <>
      <section style={sectionStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>基本情報</h2>
        <div style={grid}>
          <Field label="従業員番号 *"><input value={value.employeeNumber} onChange={e => set('employeeNumber', e.target.value)} style={inputStyle} disabled={disabled} placeholder="028" /></Field>
          <div />
          <Field label="苗字 *"><input value={value.lastName} onChange={e => set('lastName', e.target.value)} style={inputStyle} disabled={disabled} /></Field>
          <Field label="名前 *"><input value={value.firstName} onChange={e => set('firstName', e.target.value)} style={inputStyle} disabled={disabled} /></Field>
          <Field label="苗字（フリガナ）"><input value={value.lastNameKana} onChange={e => set('lastNameKana', e.target.value)} style={inputStyle} disabled={disabled} /></Field>
          <Field label="名前（フリガナ）"><input value={value.firstNameKana} onChange={e => set('firstNameKana', e.target.value)} style={inputStyle} disabled={disabled} /></Field>
          <Field label="性別">
            <select value={value.gender} onChange={e => set('gender', e.target.value)} style={inputStyle} disabled={disabled}>
              <option value="">未選択</option>
              {GENDERS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
          <Field label="未婚 / 既婚">
            <select value={value.maritalStatus} onChange={e => set('maritalStatus', e.target.value)} style={inputStyle} disabled={disabled}>
              <option value="">未選択</option>
              <option value="single">未婚</option>
              <option value="married">既婚</option>
            </select>
          </Field>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>雇用情報</h2>
        <div style={grid}>
          <Field label="入社年月日"><input type="date" value={value.hireDate} onChange={e => set('hireDate', e.target.value)} style={inputStyle} disabled={disabled} /></Field>
          <Field label="入社区分">
            <select value={value.hireType} onChange={e => set('hireType', e.target.value)} style={inputStyle} disabled={disabled}>
              <option value="">未選択</option>
              {HIRE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="雇用形態">
            <select value={value.employmentType} onChange={e => set('employmentType', e.target.value)} style={inputStyle} disabled={disabled}>
              <option value="">未選択</option>
              {EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="所属部署"><input value={value.department} onChange={e => set('department', e.target.value)} style={inputStyle} disabled={disabled} /></Field>
          <Field label="肩書き"><input value={value.jobTitle} onChange={e => set('jobTitle', e.target.value)} style={inputStyle} disabled={disabled} /></Field>
          <Field label="職種"><input value={value.jobCategory} onChange={e => set('jobCategory', e.target.value)} style={inputStyle} disabled={disabled} /></Field>
          <Field label="職務内容" span2><textarea value={value.jobDescription} onChange={e => set('jobDescription', e.target.value)} style={{ ...inputStyle, minHeight: 60 }} disabled={disabled} /></Field>
          <Field label="退社年月日"><input type="date" value={value.resignDate} onChange={e => set('resignDate', e.target.value)} style={inputStyle} disabled={disabled} /></Field>
          <Field label="退職区分">
            <select value={value.resignType} onChange={e => set('resignType', e.target.value)} style={inputStyle} disabled={disabled}>
              <option value="">未選択</option>
              {RESIGN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
          <Field label="社用メールアドレス"><input type="email" value={value.workEmail} onChange={e => set('workEmail', e.target.value)} style={inputStyle} disabled={disabled} /></Field>
          <Field label="社用電話番号"><input value={value.workPhone} onChange={e => set('workPhone', e.target.value)} style={inputStyle} disabled={disabled} /></Field>
          <Field label="保有資格" span2><textarea value={value.qualifications} onChange={e => set('qualifications', e.target.value)} style={{ ...inputStyle, minHeight: 60 }} placeholder="日商簿記2級, TOEIC 800 など" disabled={disabled} /></Field>
        </div>
      </section>

      {showSensitive && (
        <>
          <section style={sectionStyle}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>個人情報</h2>
            <div style={grid}>
              <Field label="生年月日"><input type="date" value={value.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} style={inputStyle} disabled={disabled} /></Field>
              <Field label="個人電話番号"><input value={value.personalPhone} onChange={e => set('personalPhone', e.target.value)} style={inputStyle} disabled={disabled} /></Field>
              <Field label="住所" span2><textarea value={value.address} onChange={e => set('address', e.target.value)} style={{ ...inputStyle, minHeight: 60 }} disabled={disabled} /></Field>
              <Field label="緊急連絡先" span2><textarea value={value.emergencyContact} onChange={e => set('emergencyContact', e.target.value)} style={{ ...inputStyle, minHeight: 60 }} placeholder="続柄・氏名・電話番号" disabled={disabled} /></Field>
            </div>
          </section>

          <section style={{ ...sectionStyle, borderColor: 'rgba(211, 47, 47, 0.4)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>機微情報（暗号化保存）</h2>
            <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', margin: '0 0 12px' }}>
              これらのフィールドは AES-256-GCM で暗号化されて保存されます。superadmin / hr のみ閲覧可能。
            </p>
            <div style={grid}>
              <Field label="基礎年金番号"><input value={value.basicPensionNumber} onChange={e => set('basicPensionNumber', e.target.value)} style={inputStyle} disabled={disabled} /></Field>
              <Field label="健康保険番号"><input value={value.healthInsuranceNumber} onChange={e => set('healthInsuranceNumber', e.target.value)} style={inputStyle} disabled={disabled} /></Field>
              <Field label="雇用保険番号"><input value={value.employmentInsuranceNumber} onChange={e => set('employmentInsuranceNumber', e.target.value)} style={inputStyle} disabled={disabled} /></Field>
              <Field label="在留カード番号"><input value={value.residenceCardNumber} onChange={e => set('residenceCardNumber', e.target.value)} style={inputStyle} disabled={disabled} /></Field>
              <Field label="給与振込先情報" span2><textarea value={value.payrollBankInfo} onChange={e => set('payrollBankInfo', e.target.value)} style={{ ...inputStyle, minHeight: 80 }} placeholder="銀行名 / 支店名 / 口座種別 / 口座番号 / 名義" disabled={disabled} /></Field>
            </div>
          </section>

          <section style={sectionStyle}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>添付ファイル（Google Drive リンク）</h2>
            <div style={grid}>
              <Field label="履歴書 Drive リンク" span2><input value={value.resumeDriveUrl} onChange={e => set('resumeDriveUrl', e.target.value)} style={inputStyle} placeholder="https://drive.google.com/..." disabled={disabled} /></Field>
              <Field label="名刺データ Drive リンク" span2><input value={value.businessCardDriveUrl} onChange={e => set('businessCardDriveUrl', e.target.value)} style={inputStyle} placeholder="https://drive.google.com/..." disabled={disabled} /></Field>
              <Field label="プロフィール写真 Drive リンク" span2><input value={value.profilePhotoDriveUrl} onChange={e => set('profilePhotoDriveUrl', e.target.value)} style={inputStyle} placeholder="https://drive.google.com/..." disabled={disabled} /></Field>
            </div>
          </section>
        </>
      )}
    </>
  )
}

export function buildEmployeePayload(form: EmployeeFormState, includeSensitive: boolean): Record<string, any> {
  const toNullable = (v: string) => (v.trim() === '' ? null : v.trim())
  const base: Record<string, any> = {
    employeeNumber: form.employeeNumber.trim(),
    lastName: form.lastName.trim(),
    firstName: form.firstName.trim(),
    lastNameKana: toNullable(form.lastNameKana),
    firstNameKana: toNullable(form.firstNameKana),
    hireDate: toNullable(form.hireDate),
    hireType: toNullable(form.hireType),
    employmentType: toNullable(form.employmentType),
    department: toNullable(form.department),
    jobTitle: toNullable(form.jobTitle),
    jobCategory: toNullable(form.jobCategory),
    jobDescription: toNullable(form.jobDescription),
    resignDate: toNullable(form.resignDate),
    resignType: toNullable(form.resignType),
    gender: toNullable(form.gender),
    workEmail: toNullable(form.workEmail),
    workPhone: toNullable(form.workPhone),
    qualifications: toNullable(form.qualifications),
    maritalStatus: toNullable(form.maritalStatus),
  }
  if (includeSensitive) {
    base.dateOfBirth = toNullable(form.dateOfBirth)
    base.address = toNullable(form.address)
    base.emergencyContact = toNullable(form.emergencyContact)
    base.personalPhone = toNullable(form.personalPhone)
    base.basicPensionNumber = toNullable(form.basicPensionNumber)
    base.healthInsuranceNumber = toNullable(form.healthInsuranceNumber)
    base.employmentInsuranceNumber = toNullable(form.employmentInsuranceNumber)
    base.residenceCardNumber = toNullable(form.residenceCardNumber)
    base.payrollBankInfo = toNullable(form.payrollBankInfo)
    base.resumeDriveUrl = toNullable(form.resumeDriveUrl)
    base.businessCardDriveUrl = toNullable(form.businessCardDriveUrl)
    base.profilePhotoDriveUrl = toNullable(form.profilePhotoDriveUrl)
  }
  return base
}

export function fromEmployeeApi(api: any): EmployeeFormState {
  const fmtDate = (v: any) => (v ? String(v).slice(0, 10) : '')
  return {
    ...EMPTY_EMPLOYEE,
    employeeNumber: api.employeeNumber ?? '',
    lastName: api.lastName ?? '',
    firstName: api.firstName ?? '',
    lastNameKana: api.lastNameKana ?? '',
    firstNameKana: api.firstNameKana ?? '',
    hireDate: fmtDate(api.hireDate),
    hireType: api.hireType ?? '',
    employmentType: api.employmentType ?? '',
    department: api.department ?? '',
    jobTitle: api.jobTitle ?? '',
    jobCategory: api.jobCategory ?? '',
    jobDescription: api.jobDescription ?? '',
    resignDate: fmtDate(api.resignDate),
    resignType: api.resignType ?? '',
    gender: api.gender ?? '',
    workEmail: api.workEmail ?? '',
    workPhone: api.workPhone ?? '',
    dateOfBirth: fmtDate(api.dateOfBirth),
    address: api.address ?? '',
    emergencyContact: api.emergencyContact ?? '',
    personalPhone: api.personalPhone ?? '',
    basicPensionNumber: api.basicPensionNumber ?? '',
    healthInsuranceNumber: api.healthInsuranceNumber ?? '',
    employmentInsuranceNumber: api.employmentInsuranceNumber ?? '',
    residenceCardNumber: api.residenceCardNumber ?? '',
    payrollBankInfo: api.payrollBankInfo ?? '',
    qualifications: api.qualifications ?? '',
    resumeDriveUrl: api.resumeDriveUrl ?? '',
    businessCardDriveUrl: api.businessCardDriveUrl ?? '',
    profilePhotoDriveUrl: api.profilePhotoDriveUrl ?? '',
    maritalStatus: api.maritalStatus ?? '',
  }
}
