/**
 * ファイルストレージ抽象化レイヤー
 *
 * 本番環境: Vercel Blob（BLOB_READ_WRITE_TOKEN が必要）
 * 開発環境: BLOB_READ_WRITE_TOKEN が未設定の場合はローカル /public/uploads にフォールバック
 */

import { put, del } from '@vercel/blob'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'

const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN

/**
 * ファイルをアップロードして公開 URL を返す
 *
 * @param buffer     ファイルのバイナリ
 * @param filename   保存ファイル名（例: avatars/admin-123.jpg）
 * @param contentType  MIME タイプ
 */
export async function uploadFile(
  buffer: Buffer,
  filename: string,
  contentType: string
): Promise<string> {
  if (USE_BLOB) {
    const blob = await put(filename, buffer, {
      access: 'public',
      contentType,
    })
    return blob.url
  }

  // 開発用フォールバック: ローカルの public/uploads に保存
  const uploadDir = path.join(process.cwd(), 'public', 'uploads', path.dirname(filename))
  await mkdir(uploadDir, { recursive: true })
  await writeFile(path.join(process.cwd(), 'public', 'uploads', filename), buffer)
  return `/uploads/${filename}`
}

/**
 * ファイルを削除する
 *
 * @param url  uploadFile で返された URL
 */
export async function deleteFile(url: string): Promise<void> {
  if (!url) return

  if (USE_BLOB && url.startsWith('https://')) {
    try {
      await del(url)
    } catch (_) {
      // 削除失敗は無視（すでに削除済みなど）
    }
    return
  }

  // ローカルファイルの削除
  if (url.startsWith('/uploads/')) {
    const { unlink } = await import('fs/promises')
    const localPath = path.join(process.cwd(), 'public', url)
    try {
      await unlink(localPath)
    } catch (_) {
      // ファイルが存在しない場合は無視
    }
  }
}
