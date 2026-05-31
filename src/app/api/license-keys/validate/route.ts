import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/**
 * POST /api/license-keys/validate
 * 新規登録ステップ1用の公開エンドポイント。
 * ライセンスキーが存在し、かつ未使用であるかを検証する。
 * body: { key: string }
 * 200 { valid: true } / 400 { valid: false, error }
 */
export async function POST(request: NextRequest) {
  let key = ''
  try {
    const body = await request.json()
    key = typeof body?.key === 'string' ? body.key.trim() : ''
  } catch {
    return NextResponse.json({ valid: false, error: 'リクエストが不正です' }, { status: 400 })
  }

  if (!key) {
    return NextResponse.json({ valid: false, error: 'ライセンスキーを入力してください' }, { status: 400 })
  }

  const record = await prisma.licenseKey.findUnique({ where: { key } })

  if (!record) {
    return NextResponse.json({ valid: false, error: 'ライセンスキーが確認できませんでした。入力内容をご確認ください。' }, { status: 400 })
  }
  if (record.isUsed) {
    return NextResponse.json({ valid: false, error: 'このライセンスキーは既に使用済みです。' }, { status: 400 })
  }

  return NextResponse.json({ valid: true })
}
