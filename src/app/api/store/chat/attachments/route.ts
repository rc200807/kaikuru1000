import { NextRequest, NextResponse } from 'next/server'
import { getStoreContext } from '@/lib/chat'
import { uploadChatAttachment } from '@/lib/chat-upload'

/** チャット添付（画像/ファイル）のアップロード（店舗） */
export async function POST(request: NextRequest) {
  const ctx = await getStoreContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData().catch(() => null)
  const file = formData?.get('file')
  return uploadChatAttachment(file, `store_${ctx.storeId}`)
}
