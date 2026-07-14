import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePartner } from '@/lib/partner-auth'
import { z } from 'zod'
import { buildUserNameUpdateData } from '@/lib/name-utils'

const updateSchema = z.object({
  name:                 z.string().min(1).max(120).optional(),
  furigana:             z.string().max(120).optional(),
  lastName:             z.string().max(60).optional().or(z.literal('')),
  firstName:            z.string().max(60).optional().or(z.literal('')),
  lastNameKana:         z.string().max(60).optional().or(z.literal('')),
  firstNameKana:        z.string().max(60).optional().or(z.literal('')),
  email:                z.string().email().nullable().optional().or(z.literal('')),
  phone:                z.string().max(40).optional(),
  address:              z.string().max(500).optional(),
  customerType:         z.enum(['visit', 'delivery', 'regular', 'akikuru']).optional(),
  visitFrequencyMonths: z.number().int().min(1).max(60).optional(),
})

const noteSchema = z.object({
  note: z.string().max(4000).nullable().optional(),
  tag:  z.string().max(100).nullable().optional(),
})

/** ライセンスキー所有顧客の詳細を取得（パートナー専用） */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requirePartner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const customer = await prisma.user.findFirst({
    where: { id, licenseKeyId: { not: null } },
    select: {
      id: true,
      name: true,
      furigana: true,
      lastName: true,
      firstName: true,
      lastNameKana: true,
      firstNameKana: true,
      email: true,
      phone: true,
      address: true,
      customerType: true,
      customerTypes: true,
      visitFrequencyMonths: true,
      createdAt: true,
      isActive: true,
      licenseKey: { select: { key: true } },
      store: { select: { id: true, name: true } },
      partnerNotes: {
        where: { salesPartnerId: user.id },
        select: { id: true, note: true, tag: true, updatedAt: true },
      },
    },
  })
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { partnerNotes, ...rest } = customer
  return NextResponse.json({ ...rest, partnerNote: partnerNotes[0] ?? null })
}

/** 基本情報を編集（パートナー専用 - ライセンスキー所有顧客のみ） */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requirePartner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  // ライセンスキー所有のみ編集可
  const customer = await prisma.user.findFirst({
    where: { id, licenseKeyId: { not: null } },
    select: { id: true },
  })
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  // 氏名・ふりがな系は結合値・分割値を整合させて更新（それ以外はそのまま）
  const { name, furigana, lastName, firstName, lastNameKana, firstNameKana, ...restData } = parsed.data
  const data: any = {
    ...restData,
    ...buildUserNameUpdateData({ name, furigana, lastName, firstName, lastNameKana, firstNameKana }),
  }
  if (data.email === '') data.email = null

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true, name: true, furigana: true, email: true, phone: true, address: true,
      customerType: true, visitFrequencyMonths: true, updatedAt: true,
    },
  })
  return NextResponse.json(updated)
}

/** パートナー独自のメモ/タグを upsert */
export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await requirePartner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await ctx.params

  const customer = await prisma.user.findFirst({
    where: { id, licenseKeyId: { not: null } },
    select: { id: true },
  })
  if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json()
  const parsed = noteSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  const note = await prisma.salesPartnerCustomerNote.upsert({
    where: { salesPartnerId_userId: { salesPartnerId: user.id, userId: id } },
    create: {
      salesPartnerId: user.id,
      userId: id,
      note: parsed.data.note ?? null,
      tag:  parsed.data.tag  ?? null,
    },
    update: {
      note: parsed.data.note ?? null,
      tag:  parsed.data.tag  ?? null,
    },
    select: { id: true, note: true, tag: true, updatedAt: true },
  })
  return NextResponse.json(note)
}
