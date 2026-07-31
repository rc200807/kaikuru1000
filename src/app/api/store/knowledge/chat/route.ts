import { NextRequest } from 'next/server'
import { handleChatGet, handleChatPost, handleChatDelete } from '@/lib/knowledge-chat-route'

// Gemini の応答待ちがあるため上限を明示する
export const maxDuration = 60

export async function GET() {
  return handleChatGet('store')
}

export async function POST(req: NextRequest) {
  return handleChatPost('store', req)
}

export async function DELETE() {
  return handleChatDelete('store')
}
