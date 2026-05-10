import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireAdmin, canViewEmployee, canEditEmployee, canViewSensitiveEmployee } from '@/lib/admin-auth'
import { encField, serializeEmployee, HIRE_TYPES, EMPLOYMENT_TYPES, RESIGN_TYPES, GENDERS, MARITAL_STATUSES } from '@/lib/employee-utils'

const dateLike = z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional()

const updateSchema = z.object({
  employeeNumber: z.string().min(1).max(40).optional(),
  lastName: z.string().min(1).max(60).optional(),
  firstName: z.string().min(1).max(60).optional(),
  lastNameKana: z.string().max(80).nullable().optional(),
  firstNameKana: z.string().max(80).nullable().optional(),
  hireDate: dateLike,
  hireType: z.enum(HIRE_TYPES).nullable().optional(),
  employmentType: z.enum(EMPLOYMENT_TYPES).nullable().optional(),
  department: z.string().max(80).nullable().optional(),
  jobTitle: z.string().max(80).nullable().optional(),
  jobCategory: z.string().max(80).nullable().optional(),
  jobDescription: z.string().max(2000).nullable().optional(),
  resignDate: dateLike,
  resignType: z.enum(RESIGN_TYPES).nullable().optional(),
  gender: z.enum(GENDERS).nullable().optional(),
  workEmail: z.string().email().nullable().optional().or(z.literal('')),
  workPhone: z.string().max(40).nullable().optional(),
  dateOfBirth: dateLike,
  address: z.string().max(500).nullable().optional(),
  emergencyContact: z.string().max(500).nullable().optional(),
  personalPhone: z.string().max(40).nullable().optional(),
  basicPensionNumber: z.string().max(40).nullable().optional(),
  healthInsuranceNumber: z.string().max(40).nullable().optional(),
  employmentInsuranceNumber: z.string().max(40).nullable().optional(),
  residenceCardNumber: z.string().max(40).nullable().optional(),
  payrollBankInfo: z.string().max(1000).nullable().optional(),
  qualifications: z.string().max(2000).nullable().optional(),
  resumeDriveUrl: z.string().max(500).nullable().optional(),
  businessCardDriveUrl: z.string().max(500).nullable().optional(),
  profilePhotoDriveUrl: z.string().max(500).nullable().optional(),
  maritalStatus: z.enum(MARITAL_STATUSES).nullable().optional(),
})

const SENSITIVE_KEYS = [
  'basicPensionNumber', 'healthInsuranceNumber', 'employmentInsuranceNumber',
  'residenceCardNumber', 'payrollBankInfo',
] as const

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user || !canViewEmployee(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const employee = await prisma.employee.findUnique({ where: { id } })
  if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json(serializeEmployee(employee, user.role))
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user || !canEditEmployee(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params
  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const d = parsed.data

  const touchingSensitive = SENSITIVE_KEYS.some(k => k in body)
  if (touchingSensitive && !canViewSensitiveEmployee(user.role)) {
    return NextResponse.json({ error: '機微情報の編集権限がありません' }, { status: 403 })
  }

  const data: any = {}
  const passthrough = [
    'employeeNumber', 'lastName', 'firstName', 'lastNameKana', 'firstNameKana',
    'hireType', 'employmentType', 'department', 'jobTitle', 'jobCategory', 'jobDescription',
    'resignType', 'gender', 'workEmail', 'workPhone', 'address', 'emergencyContact', 'personalPhone',
    'qualifications', 'resumeDriveUrl', 'businessCardDriveUrl', 'profilePhotoDriveUrl', 'maritalStatus',
  ] as const
  for (const k of passthrough) {
    if (k in d) data[k] = (d as any)[k] === '' ? null : (d as any)[k]
  }
  if ('hireDate' in d) data.hireDate = d.hireDate ? new Date(d.hireDate) : null
  if ('resignDate' in d) data.resignDate = d.resignDate ? new Date(d.resignDate) : null
  if ('dateOfBirth' in d) data.dateOfBirth = d.dateOfBirth ? new Date(d.dateOfBirth) : null

  if ('basicPensionNumber' in d) data.basicPensionNumberEnc = encField(d.basicPensionNumber ?? null)
  if ('healthInsuranceNumber' in d) data.healthInsuranceNumberEnc = encField(d.healthInsuranceNumber ?? null)
  if ('employmentInsuranceNumber' in d) data.employmentInsuranceNumberEnc = encField(d.employmentInsuranceNumber ?? null)
  if ('residenceCardNumber' in d) data.residenceCardNumberEnc = encField(d.residenceCardNumber ?? null)
  if ('payrollBankInfo' in d) data.payrollBankInfoEnc = encField(d.payrollBankInfo ?? null)

  const updated = await prisma.employee.update({ where: { id }, data })
  return NextResponse.json(serializeEmployee(updated, user.role))
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user || user.role !== 'superadmin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await ctx.params
  await prisma.employee.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
