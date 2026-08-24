import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteFile } from '@/lib/storage'
import { saveImage } from '@/lib/image-server'
import { recordAccessLog } from '@/lib/access-log'

// 紙で作成した売買契約書の写真（案件に紐づく）のアップロード・削除。
// 店舗は自店舗の案件のみ。管理者は全件。顧客は不可。

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']
const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

async function resolveDeal(id: string, sessionUser: any) {
  const deal = await prisma.deal.findUnique({ where: { id }, select: { id: true, storeId: true, paperContractImages: true } })
  if (!deal) return { error: '案件が見つかりません', status: 404 as const }
  const isStore = sessionUser.role === 'store'
  const isAdmin = ADMIN_ROLES.includes(sessionUser.role)
  if (!isStore && !isAdmin) return { error: 'Forbidden', status: 403 as const }
  if (isStore && deal.storeId !== sessionUser.id) return { error: 'Forbidden', status: 403 as const }
  return { deal }
}

function parseImages(json: string | null): string[] {
  try { const a = JSON.parse(json || '[]'); return Array.isArray(a) ? a : [] } catch { return [] }
}

function proxyUrls(dealId: string, list: string[]): string[] {
  return list.map((_, i) => `/api/deals/${dealId}/contract-images/${i}`)
}

/** 紙契約書の写真をアップロードして案件に追加 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveDeal(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'ファイルサイズは10MB以下にしてください' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: 'JPEG/PNG/WebP/HEIC形式のみ対応しています' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const { url } = await saveImage(buffer, `deal-contracts/${id}_${Date.now()}`, file.type)

  const list = parseImages(access.deal.paperContractImages)
  list.push(url)
  await prisma.deal.update({ where: { id }, data: { paperContractImages: JSON.stringify(list) } })

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, memberId: sessionUser.memberId ?? null, action: '紙契約書の写真をアップロード', req: request })
  return NextResponse.json({ images: proxyUrls(id, list) }, { status: 201 })
}

/** 紙契約書の写真を削除（?index=N） */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveDeal(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const index = parseInt(new URL(request.url).searchParams.get('index') || '-1', 10)
  const list = parseImages(access.deal.paperContractImages)
  if (index < 0 || index >= list.length) return NextResponse.json({ error: 'インデックスが不正です' }, { status: 400 })

  const [removed] = list.splice(index, 1)
  await prisma.deal.update({ where: { id }, data: { paperContractImages: JSON.stringify(list) } })
  if (removed) { try { await deleteFile(removed) } catch { /* ignore */ } }

  return NextResponse.json({ images: proxyUrls(id, list) })
}
