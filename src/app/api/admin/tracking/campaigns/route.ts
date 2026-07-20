import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/admin-auth'
import { parseJsonSafe, resolveTrackingParams, dateWhere } from '../_lib/common'

export const dynamic = 'force-dynamic'

function buildUrl(baseUrl: string, params: Record<string, string>): string {
  try {
    const u = new URL(baseUrl)
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v)
    return u.toString()
  } catch {
    return baseUrl
  }
}

// キャンペーンURL一覧（期間内の成果を自動突合）・発行
export async function GET(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { range } = resolveTrackingParams(request)
  const campaigns = await prisma.trackingCampaign.findMany({ orderBy: { createdAt: 'desc' } })

  const results = []
  for (const c of campaigns) {
    const params = parseJsonSafe<Record<string, string>>(c.params, {})
    const entries = Object.entries(params)
    // entryParams(JSON文字列) に全キー・値ペアが含まれるセッションを成果として突合
    const where = {
      startedAt: dateWhere(range),
      AND: entries.map(([k, v]) => ({ entryParams: { contains: `"${k}":"${v}"` } })),
    }
    const [sessions, conversions] = entries.length > 0
      ? await Promise.all([
          prisma.trackingSession.count({ where }),
          prisma.trackingSession.count({ where: { ...where, hasConversion: true } }),
        ])
      : [0, 0]
    results.push({
      id: c.id,
      name: c.name,
      baseUrl: c.baseUrl,
      params,
      builtUrl: buildUrl(c.baseUrl, params),
      sessions,
      conversions,
      cvr: sessions > 0 ? conversions / sessions : 0,
      createdAt: c.createdAt.toISOString(),
    })
  }
  return NextResponse.json({ campaigns: results })
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const name = String(body.name ?? '').trim()
  const baseUrl = String(body.baseUrl ?? '').trim()
  if (!name || !baseUrl) return NextResponse.json({ error: 'キャンペーン名とURLを入力してください' }, { status: 400 })
  try { new URL(baseUrl) } catch { return NextResponse.json({ error: 'URLの形式が正しくありません' }, { status: 400 }) }

  const params: Record<string, string> = {}
  if (typeof body.params === 'object' && body.params) {
    for (const [k, v] of Object.entries(body.params).slice(0, 10)) {
      const key = String(k).trim().slice(0, 50)
      const value = String(v).trim().slice(0, 100)
      if (key && value) params[key] = value
    }
  }
  if (Object.keys(params).length === 0) return NextResponse.json({ error: 'パラメータを1つ以上指定してください' }, { status: 400 })

  const campaign = await prisma.trackingCampaign.create({
    data: { name, baseUrl, params: JSON.stringify(params) },
  })
  return NextResponse.json({ id: campaign.id, builtUrl: buildUrl(baseUrl, params) })
}
