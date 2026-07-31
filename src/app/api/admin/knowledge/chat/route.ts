import { NextRequest } from 'next/server'
import { handleChatGet, handleChatPost, handleChatDelete } from '@/lib/knowledge-chat-route'

// Gemini の応答待ちがあるため上限を明示する（既定の実行時間では足りないことがある）
export const maxDuration = 60

export async function GET() {
  return handleChatGet('admin')
}

export async function POST(req: NextRequest) {
  return handleChatPost('admin', req)
}

export async function DELETE() {
  return handleChatDelete('admin')
}
