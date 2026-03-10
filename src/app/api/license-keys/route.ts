import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
    try {
      const record = await prisma.licenseKey.create({ data: { key } })
      created.push(record)
    } catch (error) {
      errors.push({ key, error: '重複または無効なキー' })
    }
  }

  return NextResponse.json({ created, errors })
}
