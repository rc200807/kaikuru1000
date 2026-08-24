import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { validateAvatarFile } from '@/lib/file-validation'
import { deleteFile } from '@/lib/storage'
import { saveImage } from '@/lib/image-server'
import { revokeAllDeviceSessions } from '@/lib/device-session'

const MIN_PASSWORD_LENGTH = 8

export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sessionUser = session.user as any
  if (!['admin','superadmin','hr'].includes(sessionUser.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

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

  // メールアドレスの重複チェック（管理ポータルの他の管理者と重複する場合のみ）
  if (email && email !== currentEmail) {
    const existing = await prisma.admin.findFirst({ where: { email, role: { not: 'sysadmin' }, NOT: { id: sessionUser.id } } })
    if (existing) {
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
    // Magic Number 検証済みのタイプで受け取り、WebP に正規化して保存する
    // （アバターは一覧で何十枚も並ぶので、長辺512px・サムネ128pxに抑える）
    const saved = await saveImage(
      Buffer.from(bytes),
      `avatars/admin-${Date.now()}`,
      avatarFile.type,
      { maxDimension: 512, thumbDimension: 128 },
    )
    avatarUrl = saved.url
  }

  const admin = sessionUser.id
    ? await prisma.admin.findUnique({ where: { id: sessionUser.id } })
    : await prisma.admin.findFirst({ where: { email: currentEmail, role: { not: 'sysadmin' } } })
  if (!admin) return NextResponse.json({ error: 'Admin not found' }, { status: 404 })

  const updateData: any = {}
  if (name)      updateData.name     = name
  if (email)     updateData.email    = email
  if (password)  updateData.password = await bcrypt.hash(password, 10)
  if (avatarUrl) {
    // 古いアバターを削除
    if (admin.avatar) await deleteFile(admin.avatar)
    updateData.avatar = avatarUrl
  }

  const updated = await prisma.admin.update({ where: { id: admin.id }, data: updateData })

  // パスワード変更時は全デバイスの長期セッションを失効
  if (updateData.password) await revokeAllDeviceSessions('admin', admin.id)

  return NextResponse.json({
    name: updated.name,
    email: updated.email,
    avatar: updated.avatar,
  })
}
