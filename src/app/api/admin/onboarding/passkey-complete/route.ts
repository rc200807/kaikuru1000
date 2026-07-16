import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { recordAccessLog } from '@/lib/access-log'

// パスキー登録完了後に status を pending_passkey → pending_approval へ前進させる。
// 実際にパスキーが1件以上登録済みであることをサーバー側で確認する。
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = await prisma.admin.findUnique({ where: { id: user.id } })
  if (!admin || admin.authMethod !== 'idpass') {
    return NextResponse.json({ error: '対象外のアカウントです' }, { status: 400 })
  }
  if (admin.status !== 'pending_passkey') {
    // 既に前進済みなら冪等に成功扱い
    return NextResponse.json({ ok: true, status: admin.status })
  }

  const credentialCount = await prisma.passkeyCredential.count({
    where: { userType: 'admin', userId: admin.id },
  })
  if (credentialCount === 0) {
    return NextResponse.json({ error: 'パスキーが登録されていません' }, { status: 400 })
  }

  await prisma.admin.update({
    where: { id: admin.id },
    data: { status: 'pending_approval' },
  })

  await recordAccessLog({
    userType: user.role || 'admin', userId: admin.id, userName: admin.name,
    action: 'パスキー登録完了（承認待ちへ）', req: request,
  })

  return NextResponse.json({ ok: true, status: 'pending_approval' })
}
