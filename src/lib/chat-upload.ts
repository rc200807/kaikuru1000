import { NextResponse } from 'next/server'
import { uploadFile } from '@/lib/storage'
import type { ChatAttachment } from '@/lib/chat'

const MAX_SIZE = 10 * 1024 * 1024 // 10MB

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/gif']
const FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
]

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'application/zip': 'zip',
}

/**
 * チャット添付を検証・保存し、ChatAttachment を返す共通ハンドラ。
 * @param file       FormData から取得した File
 * @param prefix     保存パスのプレフィックス（例 "store_abc" / "admin_xyz"）
 */
export async function uploadChatAttachment(file: unknown, prefix: string): Promise<NextResponse> {
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 })
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'ファイルサイズは10MB以下にしてください' }, { status: 400 })
  }

  const isImage = IMAGE_TYPES.includes(file.type)
  const isFile = FILE_TYPES.includes(file.type)
  if (!isImage && !isFile) {
    return NextResponse.json({ error: '対応していないファイル形式です' }, { status: 400 })
  }

  try {
    const ext = EXT_BY_MIME[file.type] ?? 'bin'
    const buffer = Buffer.from(await file.arrayBuffer())
    const url = await uploadFile(buffer, `chat/${prefix}_${Date.now()}.${ext}`, file.type)
    const attachment: ChatAttachment = {
      url,
      name: file.name || `attachment.${ext}`,
      mimeType: file.type,
      size: file.size,
      kind: isImage ? 'image' : 'file',
    }
    return NextResponse.json({ attachment })
  } catch (error) {
    console.error('Chat attachment upload error:', error)
    return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
  }
}
