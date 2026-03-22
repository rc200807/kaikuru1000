import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteFile } from '@/lib/storage'

/** 動画更新 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()

  const existing = await prisma.trainingVideo.findUnique({ where: { id } })
  if (!existing) {
    return NextResponse.json({ error: '動画が見つかりません' }, { status: 404 })
  }

  const updateData: any = {}
  if (body.title !== undefined) updateData.title = body.title.trim()
  if (body.description !== undefined) updateData.description = body.description?.trim() || null
  if (body.categoryId !== undefined) updateData.categoryId = body.categoryId
  if (body.sortOrder !== undefined) updateData.sortOrder = body.sortOrder

  // 動画ファイル差し替え
  if (body.videoUrl !== undefined) {
    // 古い動画ファイルを削除
    if (existing.videoUrl && existing.videoUrl !== body.videoUrl) {
      await deleteFile(existing.videoUrl)
    }
    updateData.videoUrl = body.videoUrl.trim()
  }

  // サムネイル差し替え
  if (body.thumbnailUrl !== undefined) {
    if (existing.thumbnailUrl && existing.thumbnailUrl !== body.thumbnailUrl) {
      await deleteFile(existing.thumbnailUrl)
    }
    updateData.thumbnailUrl = body.thumbnailUrl?.trim() || null
  }

  if (body.fileSize !== undefined) updateData.fileSize = body.fileSize

  if (body.isPublished !== undefined) {
    updateData.isPublished = body.isPublished
    if (body.isPublished && !existing.publishedAt) {
      updateData.publishedAt = new Date()
    }
  }

  const updated = await prisma.trainingVideo.update({
    where: { id },
    data: updateData,
    include: {
      category: { select: { id: true, name: true } },
      admin: { select: { name: true } },
    },
  })

  return NextResponse.json(updated)
}

/** 動画削除 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || user?.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const video = await prisma.trainingVideo.findUnique({ where: { id } })
  if (video) {
    // 動画ファイルとサムネイルを削除
    if (video.videoUrl) await deleteFile(video.videoUrl)
    if (video.thumbnailUrl) await deleteFile(video.thumbnailUrl)
  }

  await prisma.trainingVideo.delete({ where: { id } })
  return NextResponse.json({ deleted: true })
}
