'use client'

import {
  CORPORATE_PREFIXES, ENTITY_TYPES, ENTITY_TYPE_LABEL,
  OPERATOR_SUPPORTED_SERVICES,
  type EntityType, type OperatorSupportedServiceKey,
} from '@/lib/operator-utils'
import BankSearch from '@/components/customer/BankSearch'

export type OperatorFormState = {
  entityType: EntityType
  corporatePrefix: string
  name: string
  address: string
  representativeName: string
  representativeNameKana: string
  corporateNumber: string
  invoiceRegistered: boolean
  invoiceNumber: string
  phone: string
  email: string
  antiquePermitNumber: string
  antiqueOfficeAddress: string
  antiqueLicenseHolder: string
  publicSafetyCommission: string
  service: string
  supportedServices: OperatorSupportedServiceKey[]
  bankName: string
  branchName: string
  accountType: string
  accountNumber: string
  accountHolder: string
}

export const INITIAL_FORM: OperatorFormState = {
  entityType: 'corporation',
  corporatePrefix: '株式会社',
  name: '',
  address: '',
  representativeName: '',
  representativeNameKana: '',
  corporateNumber: '',
  invoiceRegistered: false,
  invoiceNumber: '',
  phone: '',
  email: '',
  antiquePermitNumber: '',
  antiqueOfficeAddress: '',
  antiqueLicenseHolder: '',
  publicSafetyCommission: '',
  service: '',
  supportedServices: [],
  bankName: '',
  branchName: '',
  accountType: '',
  accountNumber: '',
  accountHolder: '',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)', marginBottom: 4,
}
const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '8px 12px', borderRadius: 8,
  border: '1px solid var(--md-sys-color-outline-variant)',
  background: 'var(--md-sys-color-surface-container-highest)',
  color: 'var(--md-sys-color-on-surface)', fontSize: 13,
}

export default function OperatorForm({ value, onChange }: { value: OperatorFormState; onChange: (next: OperatorFormState) => void }) {
  const isCorporation = value.entityType === 'corporation'

  function set<K extends keyof OperatorFormState>(key: K, v: OperatorFormState[K]) {
    onChange({ ...value, [key]: v })
  }

  function toggleService(key: OperatorSupportedServiceKey) {
    const next = value.supportedServices.includes(key)
      ? value.supportedServices.filter(k => k !== key)
      : [...value.supportedServices, key]
    set('supportedServices', next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* 基本情報 */}
      <Section title="基本情報">
        <Grid>
          <div>
            <label style={labelStyle}>会社形態 *</label>
            <select value={value.entityType} onChange={e => set('entityType', e.target.value as EntityType)} style={inputStyle}>
              {ENTITY_TYPES.map(t => <option key={t} value={t}>{ENTITY_TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          {isCorporation && (
            <div>
              <label style={labelStyle}>法人種別</label>
              <select value={value.corporatePrefix} onChange={e => set('corporatePrefix', e.target.value)} style={inputStyle}>
                {CORPORATE_PREFIXES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          )}
          <div style={{ gridColumn: isCorporation ? undefined : '1 / -1' }}>
            <label style={labelStyle}>{isCorporation ? '法人名 *' : '屋号 *'}</label>
            <input
              type="text"
              value={value.name}
              onChange={e => set('name', e.target.value)}
              style={inputStyle}
              placeholder={isCorporation ? '例: 株式会社買いクル' : '例: ○○商店'}
            />
            {isCorporation && (
              <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--md-sys-color-on-surface-variant)' }}>
                「株式会社」などの表記も含めて正式名称を入力してください
              </p>
            )}
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>所在地</label>
            <input type="text" value={value.address} onChange={e => set('address', e.target.value)} style={inputStyle} />
          </div>
        </Grid>
      </Section>

      {/* 代表者・連絡先 */}
      <Section title="代表者・連絡先">
        <Grid>
          <div>
            <label style={labelStyle}>代表者氏名 *</label>
            <input type="text" value={value.representativeName} onChange={e => set('representativeName', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>代表者氏名（フリガナ）</label>
            <input type="text" value={value.representativeNameKana} onChange={e => set('representativeNameKana', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>電話番号</label>
            <input type="tel" value={value.phone} onChange={e => set('phone', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>メールアドレス</label>
            <input type="email" value={value.email} onChange={e => set('email', e.target.value)} style={inputStyle} />
          </div>
        </Grid>
      </Section>

      {/* 対応サービス */}
      <Section title="対応サービス">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {OPERATOR_SUPPORTED_SERVICES.map(s => (
            <label key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={value.supportedServices.includes(s.key)} onChange={() => toggleService(s.key)} />
              {s.label}
            </label>
          ))}
        </div>
      </Section>

      {/* 法人・税務情報 */}
      <Section title="法人・税務情報">
        <Grid>
          <div>
            <label style={labelStyle}>法人番号（13桁）</label>
            <input type="text" value={value.corporateNumber} onChange={e => set('corporateNumber', e.target.value)} style={inputStyle} placeholder="1234567890123" />
          </div>
          <div>
            <label style={labelStyle}>インボイス登録</label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 0' }}>
              <input type="checkbox" checked={value.invoiceRegistered} onChange={e => set('invoiceRegistered', e.target.checked)} />
              登録済
            </label>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>適格請求書発行事業者登録番号</label>
            <input type="text" value={value.invoiceNumber} onChange={e => set('invoiceNumber', e.target.value)} style={inputStyle} placeholder="T1234567890123" />
          </div>
        </Grid>
      </Section>

      {/* 銀行口座情報 */}
      <Section title="銀行口座情報">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <BankSearch
            bankName={value.bankName}
            branchName={value.branchName}
            onChange={({ bankName, branchName }) => onChange({ ...value, bankName, branchName })}
            theme="dark"
          />
          <Grid>
            <div>
              <label style={labelStyle}>口座種別</label>
              <select value={value.accountType} onChange={e => set('accountType', e.target.value)} style={inputStyle}>
                <option value="">選択してください</option>
                <option value="普通">普通</option>
                <option value="当座">当座</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>口座番号</label>
              <input type="text" inputMode="numeric" value={value.accountNumber} onChange={e => set('accountNumber', e.target.value)} style={inputStyle} placeholder="1234567" />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>口座名義</label>
              <input type="text" value={value.accountHolder} onChange={e => set('accountHolder', e.target.value)} style={inputStyle} placeholder="カ）カイクル" />
            </div>
          </Grid>
        </div>
      </Section>

      {/* 古物営業 */}
      <Section title="古物営業">
        <Grid>
          <div>
            <label style={labelStyle}>古物営業許可番号</label>
            <input type="text" value={value.antiquePermitNumber} onChange={e => set('antiquePermitNumber', e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>古物営業法届出名義</label>
            <input type="text" value={value.antiqueLicenseHolder} onChange={e => set('antiqueLicenseHolder', e.target.value)} style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>古物営業所住所</label>
            <input type="text" value={value.antiqueOfficeAddress} onChange={e => set('antiqueOfficeAddress', e.target.value)} style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>管轄公安委員会</label>
            <input type="text" value={value.publicSafetyCommission} onChange={e => set('publicSafetyCommission', e.target.value)} style={inputStyle} placeholder="例: 東京都公安委員会" />
          </div>
        </Grid>
      </Section>

      {/* 運営サービス */}
      <Section title="運営サービス">
        <textarea
          value={value.service}
          onChange={e => set('service', e.target.value)}
          rows={4}
          placeholder="運営しているサービス名・概要など"
          style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
        />
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: 'var(--md-sys-color-on-surface)' }}>{title}</h3>
      {children}
    </section>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      {children}
    </div>
  )
}
