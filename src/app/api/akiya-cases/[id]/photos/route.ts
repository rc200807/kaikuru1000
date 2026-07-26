import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { uploadFile, deleteFile } from '@/lib/storage'
import { recordAccessLog } from '@/lib/access-log'
import { parsePhotoUrls, AKIYA_CASE_PHOTO_LIMIT } from '@/lib/akiya-items'
import { resolveAkiyaCaseAccess } from '@/lib/akiya-access'

// 空き家管理案件の物件写真（複数）。店舗は自店舗の案件のみ、管理者は全件。

const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

/** 物件写真をアップロードして案件に追加 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveAkiyaCaseAccess(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const list = parsePhotoUrls(access.akiyaCase.photoUrls)
  if (list.length >= AKIYA_CASE_PHOTO_LIMIT) {
    return NextResponse.json({ error: `物件写真は${AKIYA_CASE_PHOTO_LIMIT}枚までです` }, { status: 400 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'ファイルサイズは10MB以下にしてください' }, { status: 400 })
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ error: 'JPEG/PNG/WebP/HEIC形式のみ対応しています' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
  const url = await uploadFile(buffer, `akiya-cases/${id}_${Date.now()}.${ext}`, file.type)

  list.push(url)
  await prisma.akiyaCase.update({ where: { id }, data: { photoUrls: JSON.stringify(list) } })

  await recordAccessLog({ userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name, memberId: sessionUser.memberId ?? null, action: '空き家管理案件の物件写真をアップロード', req: request })
  return NextResponse.json({ photos: list }, { status: 201 })
}

/** 物件写真を削除（?index=N） */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session || sessionUser.role === 'customer') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const access = await resolveAkiyaCaseAccess(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const index = parseInt(new URL(request.url).searchParams.get('index') || '-1', 10)
  const list = parsePhotoUrls(access.akiyaCase.photoUrls)
  if (index < 0 || index >= list.length) return NextResponse.json({ error: 'インデックスが不正です' }, { status: 400 })

  const [removed] = list.splice(index, 1)
  await prisma.akiyaCase.update({ where: { id }, data: { photoUrls: JSON.stringify(list) } })
  if (removed) { try { await deleteFile(removed) } catch { /* ignore */ } }

  return NextResponse.json({ photos: list })
}
