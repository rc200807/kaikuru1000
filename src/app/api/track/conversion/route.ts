import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { linkConversion } from '@/lib/tracking'

export const dynamic = 'force-dynamic'

// 完了画面（フォームのthanks / 問い合わせ受付完了）からのCV計測。認証不要・同一オリジン想定。
// 実在する送信レコードのみ受け付け、storeId/userId はサーバー側で解決する。
export async function POST(req: Request) {
  try {
    // sendBeacon は text/plain で届くため、まず text で受けて JSON パースする
    const raw = await req.text()
    let body: { visitorKey?: unknown; formSubmissionId?: unknown; inquiryId?: unknown } = {}
    try { body = raw ? JSON.parse(raw) : {} } catch { body = {} }

    const visitorKey = typeof body.visitorKey === 'string' ? body.visitorKey : ''
    if (!visitorKey) return NextResponse.json({ ok: false })

    if (typeof body.formSubmissionId === 'string' && body.formSubmissionId) {
      const sub = await prisma.formSubmission.findUnique({
        where: { id: body.formSubmissionId },
        select: { id: true, userId: true, form: { select: { customerStoreId: true } } },
      })
      if (!sub) return NextResponse.json({ ok: false })
      await linkConversion({
        visitorKey,
        type: 'form_submit',
        formSubmissionId: sub.id,
        storeId: sub.form?.customerStoreId ?? null,
        userId: sub.userId ?? null,
      })
    } else if (typeof body.inquiryId === 'string' && body.inquiryId) {
      const inq = await prisma.inquiry.findUnique({
        where: { id: body.inquiryId },
        select: { id: true, userId: true, storeId: true },
      })
      if (!inq) return NextResponse.json({ ok: false })
      await linkConversion({
        visitorKey,
        type: 'inquiry_submit',
        inquiryId: inq.id,
        storeId: inq.storeId ?? null,
        userId: inq.userId ?? null,
      })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
