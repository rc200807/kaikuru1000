import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encrypt'
import { z } from 'zod'

const updateSchema = z.object({
  name:               z.string().min(1).max(100).optional(),
  channelSecret:      z.string().min(1).optional(),
  channelAccessToken: z.string().min(1).optional(),
  isActive:           z.boolean().optional(),
  storeId:            z.string().nullable().optional(),
  isDefault:          z.boolean().optional(),
  loginChannelId:     z.string().max(100).nullable().optional(),
  loginChannelSecret: z.string().nullable().optional(),
  addFriendUrl:       z.string().max(500).nullable().optional(),
})

async function requireAdmin(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user || !['admin','superadmin','hr'].includes(user.role)) return null
  return user
}

// PATCH /api/admin/line/channels/[id] — チャネル更新
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await requireAdmin(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 400 })
  }

  const updateData: any = {}
  if (parsed.data.name !== undefined)               updateData.name = parsed.data.name
  if (parsed.data.channelSecret !== undefined)       updateData.channelSecret = encrypt(parsed.data.channelSecret)
  if (parsed.data.channelAccessToken !== undefined)  updateData.channelAccessToken = encrypt(parsed.data.channelAccessToken)
  if (parsed.data.isActive !== undefined)            updateData.isActive = parsed.data.isActive
  if (parsed.data.storeId !== undefined)             updateData.storeId = parsed.data.storeId
  if (parsed.data.isDefault !== undefined)           updateData.isDefault = parsed.data.isDefault
  if (parsed.data.loginChannelId !== undefined)      updateData.loginChannelId = parsed.data.loginChannelId || null
  if (parsed.data.loginChannelSecret !== undefined)  updateData.loginChannelSecret = parsed.data.loginChannelSecret ? encrypt(parsed.data.loginChannelSecret) : null
  if (parsed.data.addFriendUrl !== undefined)        updateData.addFriendUrl = parsed.data.addFriendUrl || null

  // 既定チャネルは全体で1つ（設定時は他チャネルを解除）
  const channel = await prisma.$transaction(async (tx) => {
    if (updateData.isDefault === true) {
      await tx.lineChannel.updateMany({
        where: { isDefault: true, id: { not: id } },
        data: { isDefault: false },
      })
    }
    return tx.lineChannel.update({
      where: { id },
      data: updateData,
    })
  })

  const { channelSecret: _s, channelAccessToken: _t, loginChannelSecret: _l, ...safe } = channel
  return NextResponse.json({ ...safe, hasLoginSecret: !!_l })
}

// DELETE /api/admin/line/channels/[id] — チャネル削除
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await requireAdmin(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  await prisma.lineChannel.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
