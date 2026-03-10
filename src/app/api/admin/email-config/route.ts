import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt, decrypt } from '@/lib/encrypt'

// メール設定取得
export async function GET() {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const config = await prisma.emailConfig.findFirst()

  if (!config) {
    return NextResponse.json({
      smtpHost: '',
      smtpPort: 587,
      smtpUser: '',
      fromAddress: '',
      fromName: '買いクル 本部',
      enabled: false,
      hasPassword: false,
    })
  }

  return NextResponse.json({
    smtpHost: config.smtpHost,
    smtpPort: config.smtpPort,
    smtpUser: config.smtpUser,
    fromAddress: config.fromAddress,
    fromName: config.fromName,
    enabled: config.enabled,
    hasPassword: !!config.smtpPass,
    // SMTPパスワード自体は返さない（hasPasswordフラグのみ）
  })
}

// メール設定保存（upsert）
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { smtpHost, smtpPort, smtpUser, smtpPass, fromAddress, fromName, enabled } = body

  const existing = await prisma.emailConfig.findFirst()

  const data: any = {
    smtpHost: smtpHost ?? '',
    smtpPort: smtpPort ? Number(smtpPort) : 587,
    smtpUser: smtpUser ?? '',
    fromAddress: fromAddress ?? '',
    fromName: fromName ?? '買いクル 本部',
    enabled: enabled ?? false,
  }

  // パスワードが送信された場合のみ更新（空文字は送信されても既存を維持）
  // AES-256-GCM で暗号化してDBに保存
  if (smtpPass !== undefined && smtpPass !== '') {
    data.smtpPass = encrypt(smtpPass)
  }

  if (existing) {
    await prisma.emailConfig.update({ where: { id: existing.id }, data })
  } else {
    await prisma.emailConfig.create({ data: { ...data, smtpPass: smtpPass ? encrypt(smtpPass) : '' } })
  }

  return NextResponse.json({ success: true })
}

/**
 * SMTPパスワードを復号して返す（メール送信時に内部で使用）
 * DBに保存されたパスワードは暗号化形式または平文（移行前データのフォールバック）
 */
export function getDecryptedSmtpPass(encryptedOrPlain: string): string {
  return decrypt(encryptedOrPlain)
}
