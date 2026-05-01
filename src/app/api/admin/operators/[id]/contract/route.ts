import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadFile, deleteFile } from '@/lib/storage'
import { validateContractFile } from '@/lib/file-validation'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'admin') return null
  return user
}

/** 契約書PDFを認証プロキシ経由で配信 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const op = await prisma.operator.findUnique({ where: { id }, select: { contractFilePath: true } })
  if (!op?.contractFilePath) return NextResponse.json({ error: '契約書がありません' }, { status: 404 })

  const blobUrl = op.contractFilePath
  if (!blobUrl.startsWith('https://')) {
    // ローカル開発: 静的ファイルにリダイレクト
    return NextResponse.redirect(new URL(blobUrl, request.url))
  }

  // 本番: プロキシ配信
  try {
    const res = await fetch(blobUrl)
    if (!res.ok) return NextResponse.json({ error: 'ファイルが見つかりません' }, { status: 404 })
    return new NextResponse(res.body, {
      headers: {
        'Content-Type': res.headers.get('content-type') || 'application/pdf',
        'Cache-Control': 'private, max-age=3600',
        'Content-Disposition': 'inline',
      },
    })
  } catch {
    return NextResponse.json({ error: 'ファイルの取得に失敗しました' }, { status: 500 })
  }
}

/** 契約書PDFアップロード */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const op = await prisma.operator.findUnique({ where: { id }, select: { id: true, contractFilePath: true } })
  if (!op) return NextResponse.json({ error: 'Not Found' }, { status: 404 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })

  const validation = await validateContractFile(file)
  if (!validation.valid) return NextResponse.json({ error: validation.error }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const safeName = `operators/${id}_contract_${Date.now()}.${validation.ext}`
  const fileUrl = await uploadFile(buffer, safeName, file.type)

  // 古いファイル削除
  if (op.contractFilePath) {
    try { await deleteFile(op.contractFilePath) } catch { /* ignore */ }
  }

  await prisma.operator.update({
    where: { id },
    data: {
      contractFilePath: fileUrl,
      contractFileUploadedAt: new Date(),
    },
  })

  return NextResponse.json({ ok: true })
}

/** 契約書PDF削除 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const op = await prisma.operator.findUnique({ where: { id }, select: { contractFilePath: true } })
  if (!op?.contractFilePath) return NextResponse.json({ error: '契約書がありません' }, { status: 404 })

  try { await deleteFile(op.contractFilePath) } catch { /* ignore */ }
  await prisma.operator.update({
    where: { id },
    data: { contractFilePath: null, contractFileUploadedAt: null },
  })

  return NextResponse.json({ ok: true })
}
