import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const MIN_PASSWORD_LENGTH = 8

const updateUserSchema = z.object({
  name:            z.string().min(1).max(100).optional(),
  furigana:        z.string().min(1).max(100).optional(),
  phone:           z.string().min(1).max(20).optional(),
  address:         z.string().min(1).max(200).optional(),
  currentPassword: z.string().optional(),
  newPassword:     z.string().min(MIN_PASSWORD_LENGTH, `新しいパスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください`).optional(),
})

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  // 顧客は自分の情報のみ、管理者・店舗はすべて取得可
  if (sessionUser.role === 'customer' && sessionUser.id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      licenseKey: true,
      store: true,
      visitSchedules: {
        orderBy: { visitDate: 'asc' },
        where: { visitDate: { gte: new Date() } },
        take: 3,
      },
    },
  })

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // パスワードは除外 / 身分証 Blob URL をプロキシ URL に変換（URL 露出防止）
  const { password: _, ...userWithoutPassword } = user
  return NextResponse.json({
    ...userWithoutPassword,
    idDocumentPath: user.idDocumentPath ? `/api/users/${id}/id-document` : null,
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  if (sessionUser.role === 'customer' && sessionUser.id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = updateUserSchema.safeParse(body)
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message ?? 'バリデーションエラー'
    return NextResponse.json({ error }, { status: 400 })
  }

  const { name, furigana, phone, address, currentPassword, newPassword } = parsed.data

  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const updateData: any = {}
  if (name) updateData.name = name
  if (furigana) updateData.furigana = furigana
  if (phone) updateData.phone = phone
  if (address) updateData.address = address

  // パスワード変更
  if (newPassword && currentPassword) {
    const isValid = await bcrypt.compare(currentPassword, user.password)
    if (!isValid) {
      return NextResponse.json({ error: '現在のパスワードが間違っています' }, { status: 400 })
    }
    updateData.password = await bcrypt.hash(newPassword, 10)
  }

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
  })

  const { password: _, ...userWithoutPassword } = updated
  return NextResponse.json(userWithoutPassword)
}
