import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const MAX_IMPORT_SIZE = 1 * 1024 * 1024 // 1 MB

// ライセンスキー CSVインポート（管理者のみ）
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'ファイルが指定されていません' }, { status: 400 })
  }
  if (file.size > MAX_IMPORT_SIZE) {
    return NextResponse.json({ error: 'ファイルサイズが大きすぎます（上限 1 MB）' }, { status: 400 })
  }
  if (!file.name.toLowerCase().endsWith('.csv')) {
    return NextResponse.json({ error: 'CSVファイルを指定してください' }, { status: 400 })
  }

  const text = await file.text()

  // BOM除去
  const cleanText = text.replace(/^\uFEFF/, '')

  // 行分割（空行除外）
  const lines = cleanText.split(/\r?\n/).map(l => l.trim()).filter(l => l)

  if (lines.length === 0) {
    return NextResponse.json({ error: 'CSVが空です' }, { status: 400 })
  }

  // 1列目を取得（ダブルクォートを除去）
  function parseFirstColumn(line: string): string {
    const firstCol = line.split(',')[0]
    return firstCol.replace(/^"|"$/g, '').trim()
  }

  // ヘッダー行スキップ（最初のセルが「キー」の場合）
  const startIndex = parseFirstColumn(lines[0]) === 'キー' ? 1 : 0

  const keysToImport: string[] = []
  for (let i = startIndex; i < lines.length; i++) {
    const key = parseFirstColumn(lines[i])
    if (key) keysToImport.push(key)
  }

  if (keysToImport.length === 0) {
    return NextResponse.json({ error: 'インポートするキーが見つかりませんでした' }, { status: 400 })
  }

  let created = 0
  let skipped = 0

  for (const key of keysToImport) {
    try {
      await prisma.licenseKey.create({ data: { key } })
      created++
    } catch {
      // 重複キーはスキップ
      skipped++
    }
  }

  return NextResponse.json({ success: true, created, skipped })
}
