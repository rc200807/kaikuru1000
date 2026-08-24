import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { validateAvatarFile } from '@/lib/file-validation'
import { deleteFile } from '@/lib/storage'
import { saveImage } from '@/lib/image-server'
import { recordAccessLog } from '@/lib/access-log'
import { revokeAllDeviceSessions } from '@/lib/device-session'

const MIN_PASSWORD_LENGTH = 8

/**
 * 店舗メンバーの編集（氏名・メール・パスワード・顔写真）
 * - オーナー（店舗アカウント）: 自店舗の全メンバーを編集可
 * - メンバー本人: 自分の氏名・写真・パスワードのみ編集可（メールは変更不可）
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { id } = await params

  const member = await prisma.storeMember.findUnique({ where: { id } })
  if (!member || member.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'メンバーが見つかりません' }, { status: 404 })
  }

  const isOwner = !sessionUser.memberId
  const isSelf = sessionUser.memberId === id
  if (!isOwner && !isSelf) {
    return NextResponse.json({ error: '編集権限がありません' }, { status: 403 })
  }

  const formData = await request.formData()
  const name       = formData.get('name') as string | null
  const email      = formData.get('email') as string | null
  const password   = formData.get('password') as string | null
  const avatarFile = formData.get('avatar') as File | null

  if (password && password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください` }, { status: 400 })
  }

  const updateData: Record<string, unknown> = {}
  if (name && name.trim()) updateData.name = name.trim()
  // メール変更はオーナーのみ（同一店舗内の重複チェック付き）
  if (isOwner && email && email.trim() && email.trim() !== member.email) {
    const dup = await prisma.storeMember.findFirst({
      where: { storeId: member.storeId, email: email.trim(), id: { not: id } },
    })
    if (dup) {
      return NextResponse.json({ error: 'この店舗内で同じメールアドレスが既に使用されています' }, { status: 409 })
    }
    updateData.email = email.trim()
  }
  if (password) updateData.password = await bcrypt.hash(password, 10)

  if (avatarFile && avatarFile.size > 0) {
    const validation = await validateAvatarFile(avatarFile)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    const bytes = await avatarFile.arrayBuffer()
    // アバターは一覧で並ぶので WebP・長辺512px（サムネ128px）に正規化する
    const { url } = await saveImage(
      Buffer.from(bytes),
      `avatars/member-${id}-${Date.now()}`,
      avatarFile.type,
      { maxDimension: 512, thumbDimension: 128 },
    )
    if (member.avatar) await deleteFile(member.avatar)
    updateData.avatar = url
  }

  const updated = await prisma.storeMember.update({
    where: { id },
    data: updateData,
    select: { id: true, name: true, email: true, avatar: true, createdAt: true },
  })

  // パスワード変更時は該当メンバーの全デバイス長期セッションを失効
  if (updateData.password) await revokeAllDeviceSessions('storeMember', id)

  await recordAccessLog({
    userType: sessionUser.role,
    userId: sessionUser.id,
    userName: sessionUser.name,
    memberId: sessionUser.memberId ?? null,
    action: `店舗メンバー編集「${updated.name}」`,
    req: request,
  })

  return NextResponse.json(updated)
}

// 店舗メンバー削除（オーナーのみ）
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'store') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // 削除はオーナー（店舗アカウント）のみ
  if (sessionUser.memberId) {
    return NextResponse.json({ error: 'メンバーの削除はオーナーのみ可能です' }, { status: 403 })
  }

  const { id } = await params

  const member = await prisma.storeMember.findUnique({ where: { id } })
  if (!member) {
    return NextResponse.json({ error: 'メンバーが見つかりません' }, { status: 404 })
  }
  if (member.storeId !== sessionUser.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (member.avatar) await deleteFile(member.avatar)
  await prisma.storeMember.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
