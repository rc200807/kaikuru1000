import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { appendInquiriesToSheet } from '@/lib/google-sheets'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (!['admin', 'superadmin', 'hr'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let inquiryIds: string[] | undefined
  try {
    const body = await request.json()
    if (Array.isArray(body?.inquiryIds)) inquiryIds = body.inquiryIds
  } catch {
    // body 無しは全件扱い
  }

  const result = await appendInquiriesToSheet(inquiryIds)
  return NextResponse.json(result, { status: result.success ? 200 : 400 })
}
