'use client'

import type { EmployeeFormState } from './EmployeeForm'

const sectionStyle: React.CSSProperties = {
  background: 'var(--md-sys-color-surface-container-low)',
  borderRadius: 12,
  padding: 20,
  marginBottom: 16,
  border: '1px solid var(--md-sys-color-outline-variant)',
}

function Row({ label, value, span2 }: { label: string; value: React.ReactNode; span2?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, gridColumn: span2 ? '1 / -1' : undefined }}>
      <span style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>{label}</span>
      <span style={{ color: 'var(--md-sys-color-on-surface)', fontSize: 14, whiteSpace: 'pre-wrap', wordBreak: 'break-word', minHeight: 20 }}>
        {value || <span style={{ color: 'var(--md-sys-color-outline)' }}>—</span>}
      </span>
    </div>
  )
}

function fmtDate(s: string): string {
  if (!s) return ''
  // YYYY-MM-DD → YYYY/MM/DD
  return s.replaceAll('-', '/')
}

const MARITAL_LABEL: Record<string, string> = { single: '未婚', married: '既婚' }

function Link({ url }: { url: string }) {
  if (!url) return null
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--md-sys-color-primary)', textDecoration: 'underline', wordBreak: 'break-all' }}>
      {url}
    </a>
  )
}

export default function EmployeeView({ value, showSensitive }: { value: EmployeeFormState; showSensitive: boolean }) {
  const grid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 } as React.CSSProperties

  return (
    <>
      <section style={sectionStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>基本情報</h2>
        <div style={grid}>
          <Row label="従業員番号" value={value.employeeNumber} />
          <div />
          <Row label="苗字" value={value.lastName} />
          <Row label="名前" value={value.firstName} />
          <Row label="苗字（フリガナ）" value={value.lastNameKana} />
          <Row label="名前（フリガナ）" value={value.firstNameKana} />
          <Row label="性別" value={value.gender} />
          <Row label="未婚 / 既婚" value={MARITAL_LABEL[value.maritalStatus] ?? ''} />
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>雇用情報</h2>
        <div style={grid}>
          <Row label="入社年月日" value={fmtDate(value.hireDate)} />
          <Row label="入社区分" value={value.hireType} />
          <Row label="雇用形態" value={value.employmentType} />
          <Row label="所属部署" value={value.department} />
          <Row label="肩書き" value={value.jobTitle} />
          <Row label="職種" value={value.jobCategory} />
          <Row label="職務内容" value={value.jobDescription} span2 />
          <Row label="退社年月日" value={fmtDate(value.resignDate)} />
          <Row label="退職区分" value={value.resignType} />
          <Row label="社用メールアドレス" value={value.workEmail} />
          <Row label="社用電話番号" value={value.workPhone} />
          <Row label="保有資格" value={value.qualifications} span2 />
        </div>
      </section>

      {showSensitive && (
        <>
          <section style={sectionStyle}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>個人情報</h2>
            <div style={grid}>
              <Row label="生年月日" value={fmtDate(value.dateOfBirth)} />
              <Row label="個人電話番号" value={value.personalPhone} />
              <Row label="住所" value={value.address} span2 />
              <Row label="緊急連絡先" value={value.emergencyContact} span2 />
            </div>
          </section>

          <section style={{ ...sectionStyle, borderColor: 'rgba(211, 47, 47, 0.4)' }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>機微情報（暗号化保存）</h2>
            <p style={{ fontSize: 12, color: 'var(--md-sys-color-on-surface-variant)', margin: '0 0 12px' }}>
              これらのフィールドは AES-256-GCM で暗号化されて保存されます。superadmin / hr のみ閲覧可能。
            </p>
            <div style={grid}>
              <Row label="基礎年金番号" value={value.basicPensionNumber} />
              <Row label="健康保険番号" value={value.healthInsuranceNumber} />
              <Row label="雇用保険番号" value={value.employmentInsuranceNumber} />
              <Row label="在留カード番号" value={value.residenceCardNumber} />
              <Row label="給与振込先情報" value={value.payrollBankInfo} span2 />
            </div>
          </section>

          <section style={sectionStyle}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>添付ファイル（Google Drive リンク）</h2>
            <div style={grid}>
              <Row label="履歴書 Drive リンク" value={<Link url={value.resumeDriveUrl} />} span2 />
              <Row label="名刺データ Drive リンク" value={<Link url={value.businessCardDriveUrl} />} span2 />
              <Row label="プロフィール写真 Drive リンク" value={<Link url={value.profilePhotoDriveUrl} />} span2 />
            </div>
          </section>
        </>
      )}
    </>
  )
}
