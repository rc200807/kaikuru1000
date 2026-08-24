import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fetchCustomerDocuments } from '@/lib/store-customer-overview'

/**
 * 顧客に紐づく発行済み書類（見積書・売買契約書）の一覧を返す。
 * PDF本体（base64）は転送せず、各書類のPDF有無フラグのみ返す。
 * 実PDFのダウンロードは /api/magic-link/document-pdf（店舗セッションで取得可）を使う。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sessionUser = session.user as any
  if (sessionUser.role !== 'store') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const storeId = sessionUser.id as string
  const { id: userId } = await params

  // この店舗に紐付く顧客であることを確認
  const customer = await prisma.user.findFirst({
    where: { id: userId, storeId },
    select: { id: true },
  })
  if (!customer) return NextResponse.json({ error: '顧客が見つかりません' }, { status: 404 })

  const documents = await fetchCustomerDocuments(userId, storeId)
  return NextResponse.json({ documents })
}
