import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireLinkPartner } from '@/lib/link-partner-auth'
import { resolveAssignedFormIds, linkPartnerCustomerWhere, LINKPARTNER_SAFE_USER_SELECT } from '@/lib/link-partner-query'
import { recordLinkPartnerActivity } from '@/lib/link-partner-activity'

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n') || v.includes('\r')) {
    return '"' + v.replace(/"/g, '""') + '"'
  }
  return v
}
const jst = (d: Date) => new Date(d).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
const TYPE_LABEL: Record<string, string> = { visit: '訪問買取', delivery: '宅配買取', regular: '常連', akikuru: 'アキクル' }

// 顧客CSVエクスポート（安全フィールドのみ・BOM付きUTF-8）
export async function GET(req: Request) {
  const user = await requireLinkPartner()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formIds = await resolveAssignedFormIds(user.linkPartnerId)
  const customers = formIds.length
    ? await prisma.user.findMany({ where: linkPartnerCustomerWhere(formIds), select: LINKPARTNER_SAFE_USER_SELECT, orderBy: { createdAt: 'desc' } })
    : []

  const headers = ['氏名', 'ふりがな', '電話', '電話2', '電話3', 'メール', '住所', '顧客種別', '流入元', '登録日']
  const rows = customers.map((c) => [
    c.name, c.furigana, c.phone, c.phone2 ?? '', c.phone3 ?? '', c.email ?? '', c.address,
    TYPE_LABEL[c.customerType] ?? c.customerType, c.leadSource ?? '', jst(c.createdAt),
  ])
  const csv = [headers, ...rows].map((row) => row.map((cell) => csvEscape(String(cell ?? ''))).join(',')).join('\r\n')
  const body = '﻿' + csv

  await recordLinkPartnerActivity({
    linkPartnerId: user.linkPartnerId, memberId: user.id, memberName: user.name,
    action: 'export_customers', targetType: 'customer', req,
  })

  const filename = `linkpartner-customers-${new Date().toISOString().slice(0, 10)}.csv`
  return new NextResponse(body, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` },
  })
}
