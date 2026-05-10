import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const linkSchema = z.object({
  userId: z.string().nullable(), // null で紐付け解除
})

// PATCH /api/admin/line/users/[id]/link — 顧客紐付け／解除
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!sessionUser || !['admin','superadmin','hr'].includes(sessionUser.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = linkSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }

  const lineUser = await prisma.lineUser.update({
    where: { id },
    data: { userId: parsed.data.userId },
    include: {
      user: { select: { id: true, name: true, furigana: true, phone: true } },
    },
  })

  return NextResponse.json(lineUser)
}
