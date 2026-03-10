import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { validateAvatarFile } from '@/lib/file-validation'
import { uploadFile, deleteFile } from '@/lib/storage'

const MIN_PASSWORD_LENGTH = 8

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  if (sessionUser.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const currentEmail = sessionUser.email

  const formData = await request.formData()
  const name       = formData.get('name') as string | null
  const email      = formData.get('email') as string | null
  const password   = formData.get('password') as string | null
  const avatarFile = formData.get('avatar') as File | null

  // パスワード長チェック
  if (password && password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください` }, { status: 400 })
  }

  // メールアドレスの重複チェック（自分以外）
  if (email && email !== currentEmail) {
    const [existStore, existMember] = await Promise.all([
      prisma.store.findFirst({ where: { email } }),
      prisma.storeMember.findUnique({ where: { email } }),
    ])
    if (existStore || existMember) {
      return NextResponse.json({ error: 'このメールアドレスはすでに使用されています' }, { status: 409 })
    }
  }

  // アバター画像のアップロード（Magic Number検証 + Vercel Blob）
  let avatarUrl: string | undefined
  if (avatarFile && avatarFile.size > 0) {
    const validation = await validateAvatarFile(avatarFile)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    const bytes = await avatarFile.arrayBuffer()
    avatarUrl = await uploadFile(
      Buffer.from(bytes),
      `avatars/store-${Date.now()}.${validation.ext}`,
      avatarFile.type, // Magic Number 検証済みの MIME タイプ
    )
  }

  // 店舗アカウント or 店舗メンバーを特定してアップデート
  const store = await prisma.store.findFirst({ where: { email: currentEmail } })
  if (store) {
    const updateData: any = {}
    if (name)      updateData.name     = name
    if (email)     updateData.email    = email
    if (password)  updateData.password = await bcrypt.hash(password, 10)
    if (avatarUrl) {
      if (store.avatar) await deleteFile(store.avatar)
      updateData.avatar = avatarUrl
    }
    const updated = await prisma.store.update({ where: { id: store.id }, data: updateData })
    return NextResponse.json({
      name: updated.name,
      email: updated.email,
      avatar: updated.avatar,
    })
  }

  const member = await prisma.storeMember.findUnique({ where: { email: currentEmail } })
  if (member) {
    const updateData: any = {}
    if (name)      updateData.name     = name
    if (email)     updateData.email    = email
    if (password)  updateData.password = await bcrypt.hash(password, 10)
    if (avatarUrl) {
      if (member.avatar) await deleteFile(member.avatar)
      updateData.avatar = avatarUrl
    }
    const updated = await prisma.storeMember.update({ where: { id: member.id }, data: updateData })
    return NextResponse.json({
      name: updated.name,
      email: updated.email,
      avatar: updated.avatar,
    })
  }

  return NextResponse.json({ error: 'User not found' }, { status: 404 })
}
