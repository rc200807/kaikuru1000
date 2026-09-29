import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { isLoginBlocked, recordLoginFailure, resetLoginFailures } from '@/lib/rate-limit'
import { recordAccessLog } from '@/lib/access-log'
import { clientInfoFromHeaders, createAdminLoginRequest } from '@/lib/admin-login-request'

/**
 * ID+パスワード方式の管理者: ログインリクエストを出す（未ログインから呼ぶ公開API）。
 * ID/パスワードを再検証し、正しければリクエストを作成して申請端末用の token を返す。
 * レート制限は管理者ログインと同じキーを共有する（ここから総当たりできないように）。
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const identifier = typeof body?.identifier === 'string' ? body.identifier : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!identifier || !password) {
    return NextResponse.json({ error: 'ログインIDとパスワードを入力してください' }, { status: 400 })
  }

  const key = `admin:${identifier}`
  const { blocked, remainingMs } = await isLoginBlocked(key)
  if (blocked) {
    const mins = Math.ceil((remainingMs ?? 0) / 60000)
    return NextResponse.json({ error: `ログインがブロックされています。${mins}分後に再試行してください` }, { status: 429 })
  }

  const admin = await prisma.admin.findUnique({ where: { loginId: identifier } })
  const valid = !!admin && admin.authMethod === 'idpass' && admin.role !== 'sysadmin'
    && await bcrypt.compare(password, admin.password)
  if (!valid || !admin) {
    await recordLoginFailure(key)
    return NextResponse.json({ error: 'ログインIDまたはパスワードが間違っています' }, { status: 401 })
  }
  await resetLoginFailures(key)

  const { ip, userAgent } = clientInfoFromHeaders(request.headers)
  const created = await createAdminLoginRequest({ adminId: admin.id, ip, userAgent })

  const role = (admin.role === 'superadmin' || admin.role === 'hr') ? admin.role : 'admin'
  await recordAccessLog({
    userType: role, userId: admin.id, userName: admin.name,
    action: 'ログインリクエストを送信', req: request,
  })

  return NextResponse.json({
    requestId: created.requestId,
    token: created.token,
    code: created.code,
    expiresAt: created.expiresAt.toISOString(),
    name: admin.name,
  }, { status: 201 })
}
