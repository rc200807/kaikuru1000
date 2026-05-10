import { encrypt, decrypt } from '@/lib/encrypt'
import type { AdminRole } from '@/lib/admin-auth'
import { canViewSensitiveEmployee } from '@/lib/admin-auth'

export const HIRE_TYPES = ['新卒', '中途', '出向', 'その他'] as const
export const EMPLOYMENT_TYPES = ['正社員', '契約社員', 'パート', 'アルバイト', '業務委託', '派遣', 'その他'] as const
export const RESIGN_TYPES = ['自己都合', '会社都合', '定年', '契約満了', 'その他'] as const
export const GENDERS = ['男性', '女性', 'その他', '未回答'] as const
export const MARITAL_STATUSES = ['single', 'married'] as const

export const SENSITIVE_FIELDS = [
  'basicPensionNumber',
  'healthInsuranceNumber',
  'employmentInsuranceNumber',
  'residenceCardNumber',
  'payrollBankInfo',
  'personalPhone',
  'address',
  'emergencyContact',
  'dateOfBirth',
  'resumeDriveUrl',
] as const

export type EncryptedFieldKey =
  | 'basicPensionNumber'
  | 'healthInsuranceNumber'
  | 'employmentInsuranceNumber'
  | 'residenceCardNumber'
  | 'payrollBankInfo'

export const ENCRYPTED_FIELD_KEYS: EncryptedFieldKey[] = [
  'basicPensionNumber',
  'healthInsuranceNumber',
  'employmentInsuranceNumber',
  'residenceCardNumber',
  'payrollBankInfo',
]

export function encField(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === '') return null
  return encrypt(plain)
}

export function decField(cipher: string | null | undefined): string | null {
  if (!cipher) return null
  return decrypt(cipher)
}

type EmployeeRow = Record<string, any>

/**
 * DB row → API response。role に応じて機微フィールドをマスク。
 */
export function serializeEmployee(row: EmployeeRow, role: AdminRole) {
  const base = {
    id: row.id,
    employeeNumber: row.employeeNumber,
    lastName: row.lastName,
    firstName: row.firstName,
    lastNameKana: row.lastNameKana,
    firstNameKana: row.firstNameKana,
    hireDate: row.hireDate,
    hireType: row.hireType,
    employmentType: row.employmentType,
    department: row.department,
    jobTitle: row.jobTitle,
    jobCategory: row.jobCategory,
    jobDescription: row.jobDescription,
    resignDate: row.resignDate,
    resignType: row.resignType,
    gender: row.gender,
    workEmail: row.workEmail,
    workPhone: row.workPhone,
    qualifications: row.qualifications,
    businessCardDriveUrl: row.businessCardDriveUrl,
    profilePhotoDriveUrl: row.profilePhotoDriveUrl,
    maritalStatus: row.maritalStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }

  if (!canViewSensitiveEmployee(role)) {
    return base
  }

  return {
    ...base,
    dateOfBirth: row.dateOfBirth,
    address: row.address,
    emergencyContact: row.emergencyContact,
    personalPhone: row.personalPhone,
    resumeDriveUrl: row.resumeDriveUrl,
    basicPensionNumber: decField(row.basicPensionNumberEnc),
    healthInsuranceNumber: decField(row.healthInsuranceNumberEnc),
    employmentInsuranceNumber: decField(row.employmentInsuranceNumberEnc),
    residenceCardNumber: decField(row.residenceCardNumberEnc),
    payrollBankInfo: decField(row.payrollBankInfoEnc),
  }
}

export function fullName(row: { lastName: string; firstName: string }) {
  return `${row.lastName} ${row.firstName}`
}
