import { NextRequest, NextResponse } from 'next/server'
import { fetchBranches } from '@/lib/zengin-server'

/** 指定金融機関の支店一覧（全銀データ）。取得・キャッシュは zengin-server.ts に集約している */
export async function GET(request: NextRequest) {
  const bankCode = new URL(request.url).searchParams.get('bankCode')
  if (!bankCode) {
    return NextResponse.json({ error: 'bankCode is required' }, { status: 400 })
  }
  const branches = await fetchBranches(bankCode)
  if (branches.length === 0) return NextResponse.json([], { status: 500 })
  return NextResponse.json(branches)
}
