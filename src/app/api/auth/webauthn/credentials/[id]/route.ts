/**
 * 登録済みパスキー削除 API（ログイン中ユーザー自身のもののみ）
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'
import { resolvePasskeyUser } from '@/lib/webauthn'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as
    | { role?: string; id?: string; memberId?: string | null; name?: string | null }
    | undefined
  if (!sessionUser) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
  }

  const target = resolvePasskeyUser(sessionUser)
  if (!target) {
    return NextResponse.json({ error: 'このアカウントではパスキーを利用できません' }, { status: 403 })
  }

  // 自分のクレデンシャルのみ削除可能
  const deleted = await prisma.passkeyCredential.deleteMany({
    where: { id, userType: target.userType, userId: target.userId },
  })
  if (deleted.count === 0) {
    return NextResponse.json({ error: 'パスキーが見つかりません' }, { status: 404 })
  }

  await recordAccessLog({
    userType: sessionUser.role || target.userType,
    userId: sessionUser.id || target.userId,
    userName: sessionUser.name || undefined,
    memberId: sessionUser.memberId || undefined,
    action: 'passkey-delete',
    req,
  })

  return NextResponse.json({ ok: true })
}
