import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { appendLicenseKeysToSheet } from '@/lib/google-sheets'

// ライセンスキーの形式: KA + 大文字1文字 + 数字10桁 (例: KAZ9961583613)
const LICENSE_KEY_REGEX = /^KA[A-Z][0-9]{10}$/

// ライセンスキー一覧（管理者のみ）
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const keys = await prisma.licenseKey.findMany({
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(keys)
}

// ライセンスキー追加（管理者のみ）
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { keys } = body // 配列で受け取る

  if (!keys || !Array.isArray(keys) || keys.length === 0) {
    return NextResponse.json({ error: 'キーが指定されていません' }, { status: 400 })
  }

  const created = []
  const errors = []

  for (const key of keys) {
    // 形式バリデーション
    if (!LICENSE_KEY_REGEX.test(key)) {
      errors.push({ key, error: `形式が正しくありません（KA + 大文字1文字 + 数字10桁）` })
      continue
    }
    try {
      const record = await prisma.licenseKey.create({ data: { key } })
      created.push(record)
    } catch (error) {
      errors.push({ key, error: '重複または無効なキー' })
    }
  }

  // DBへの登録が成功したキーをスプレッドシートにも追記
  if (created.length > 0) {
    await appendLicenseKeysToSheet(created.map(r => r.key)).catch(() => {
      // シート同期失敗はDBの登録結果に影響させない（ログのみ）
    })
  }

  return NextResponse.json({ created, errors })
}
