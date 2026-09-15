import { NextResponse } from 'next/server'
import { fetchBanks } from '@/lib/zengin-server'

/** 金融機関の一覧（全銀データ）。取得・キャッシュは zengin-server.ts に集約している */
export async function GET() {
  const banks = await fetchBanks()
  if (banks.length === 0) return NextResponse.json([], { status: 500 })
  return NextResponse.json(banks)
}
