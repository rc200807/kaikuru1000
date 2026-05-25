import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PASSWORD_REGEX, PASSWORD_ERROR } from '@/lib/passwordValidation'

/**
 * 売買契約後のマイページ初回アクセス時にパスワードを設定・確認する。
 * - 入力されたパスワードが既存ハッシュと一致する場合: 何もしない（OK）
 * - 一致しない場合: 新パスワードで上書き
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // 顧客は自分のパスワードのみ更新可
  if (sessionUser.role === 'customer' && sessionUser.id !== id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const password = typeof body?.password === 'string' ? body.password : ''

  if (!PASSWORD_REGEX.test(password)) {
    return NextResponse.json({ error: PASSWORD_ERROR }, { status: 400 })
  }

  const user = await prisma.user.findUnique({ where: { id }, select: { password: true } })
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const sameAsExisting = user.password ? await bcrypt.compare(password, user.password) : false

  if (!sameAsExisting) {
    const hash = await bcrypt.hash(password, 10)
    await prisma.user.update({ where: { id }, data: { password: hash } })
  }

  return NextResponse.json({ updated: !sameAsExisting })
}
