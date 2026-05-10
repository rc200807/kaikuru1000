import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireAdmin, canViewEmployee, canEditEmployee, canViewSensitiveEmployee } from '@/lib/admin-auth'
import { encField, serializeEmployee, HIRE_TYPES, EMPLOYMENT_TYPES, RESIGN_TYPES, GENDERS, MARITAL_STATUSES } from '@/lib/employee-utils'

const dateLike = z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullable().optional()

const baseSchema = z.object({
  employeeNumber: z.string().min(1).max(40),
  lastName: z.string().min(1).max(60),
  firstName: z.string().min(1).max(60),
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

export async function GET() {
  const user = await requireAdmin()
  if (!user || !canViewEmployee(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const employees = await prisma.employee.findMany({
    orderBy: [{ resignDate: 'asc' }, { employeeNumber: 'asc' }],
  })
  return NextResponse.json(employees.map(e => serializeEmployee(e, user.role)))
}

export async function POST(req: NextRequest) {
  const user = await requireAdmin()
  if (!user || !canEditEmployee(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json()
  const parsed = baseSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const d = parsed.data

  // 機微フィールドの編集権限チェック
  const editingSensitive = [
    d.basicPensionNumber, d.healthInsuranceNumber, d.employmentInsuranceNumber,
    d.residenceCardNumber, d.payrollBankInfo,
  ].some(v => v !== undefined && v !== null && v !== '')
  if (editingSensitive && !canViewSensitiveEmployee(user.role)) {
    return NextResponse.json({ error: '機微情報の編集権限がありません' }, { status: 403 })
  }

  const created = await prisma.employee.create({
    data: {
      employeeNumber: d.employeeNumber,
      lastName: d.lastName,
      firstName: d.firstName,
      lastNameKana: d.lastNameKana || null,
      firstNameKana: d.firstNameKana || null,
      hireDate: d.hireDate ? new Date(d.hireDate) : null,
      hireType: d.hireType ?? null,
      employmentType: d.employmentType ?? null,
      department: d.department || null,
      jobTitle: d.jobTitle || null,
      jobCategory: d.jobCategory || null,
      jobDescription: d.jobDescription || null,
      resignDate: d.resignDate ? new Date(d.resignDate) : null,
      resignType: d.resignType ?? null,
      gender: d.gender ?? null,
      workEmail: d.workEmail || null,
      workPhone: d.workPhone || null,
      dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth) : null,
      address: d.address || null,
      emergencyContact: d.emergencyContact || null,
      personalPhone: d.personalPhone || null,
      basicPensionNumberEnc: encField(d.basicPensionNumber ?? null),
      healthInsuranceNumberEnc: encField(d.healthInsuranceNumber ?? null),
      employmentInsuranceNumberEnc: encField(d.employmentInsuranceNumber ?? null),
      residenceCardNumberEnc: encField(d.residenceCardNumber ?? null),
      payrollBankInfoEnc: encField(d.payrollBankInfo ?? null),
      qualifications: d.qualifications || null,
      resumeDriveUrl: d.resumeDriveUrl || null,
      businessCardDriveUrl: d.businessCardDriveUrl || null,
      profilePhotoDriveUrl: d.profilePhotoDriveUrl || null,
      maritalStatus: d.maritalStatus ?? null,
    },
  })
  return NextResponse.json(serializeEmployee(created, user.role), { status: 201 })
}
