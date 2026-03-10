import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { sendTestEmail } from '@/lib/mailer'

// テストメール送信
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { toEmail } = body

  if (!toEmail) {
    return NextResponse.json({ error: '送信先メールアドレスが必要です' }, { status: 400 })
  }

  try {
    await sendTestEmail(toEmail)
    return NextResponse.json({ success: true, message: `${toEmail} にテストメールを送信しました` })
  } catch (error: any) {
    console.error('Test email error:', error)
    return NextResponse.json(
      { error: error.message || 'メール送信に失敗しました' },
      { status: 500 }
    )
  }
}
