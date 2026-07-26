import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { randomBytes } from 'crypto'
import { recordAccessLog } from '@/lib/access-log'
import { resolveAkiyaCaseAccess } from '@/lib/akiya-access'
import { sendAkiyaReportEmail } from '@/lib/mailer'

// 管理記録を顧客向けレポートとして提出する。
// トークンURLを発行（既発行なら再利用）し、顧客のメールアドレスへ送信する。
// 顧客にメールが未登録でもURLは発行し、店舗が別手段で共有できるようにする。

function reportUrlFor(token: string): string {
  const base = process.env.NEXTAUTH_URL || 'https://system.rcinc.jp'
  return `${base.replace(/\/$/, '')}/akiya-report/${token}`
}

/** 提出状況の取得（再送・URL再表示用） */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; recordId: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, recordId } = await params
  const access = await resolveAkiyaCaseAccess(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const record = await prisma.akiyaRecord.findFirst({
    where: { id: recordId, akiyaCaseId: id },
    select: { reportToken: true, reportSubmittedAt: true, reportSentTo: true, reportSentAt: true },
  })
  if (!record) return NextResponse.json({ error: '記録が見つかりません' }, { status: 404 })

  return NextResponse.json({
    submitted: !!record.reportSubmittedAt,
    url: record.reportToken ? reportUrlFor(record.reportToken) : null,
    submittedAt: record.reportSubmittedAt,
    sentTo: record.reportSentTo,
    sentAt: record.reportSentAt,
  })
}

/** レポートを提出（URL発行＋顧客へメール送信）。再実行で同じURLのまま再送できる */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; recordId: string }> }) {
  const session = await getServerSession(authOptions)
  const sessionUser = session?.user as any
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, recordId } = await params
  const access = await resolveAkiyaCaseAccess(id, sessionUser)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const record = await prisma.akiyaRecord.findFirst({
    where: { id: recordId, akiyaCaseId: id },
    select: {
      id: true, performedAt: true, reportToken: true, reportSubmittedAt: true,
      akiyaCase: {
        select: {
          propertyAddress: true,
          user: { select: { name: true, email: true } },
          store: { select: { name: true } },
        },
      },
    },
  })
  if (!record) return NextResponse.json({ error: '記録が見つかりません' }, { status: 404 })

  // トークンは初回のみ発行し、以後は同じURLを使い回す（再送しても顧客のリンクが変わらない）
  const token = record.reportToken ?? randomBytes(24).toString('hex')
  const url = reportUrlFor(token)

  const customerEmail = (record.akiyaCase.user.email ?? '').trim()
  let emailSent = false
  let emailError: string | null = null
  if (customerEmail) {
    try {
      emailSent = await sendAkiyaReportEmail({
        customerEmail,
        customerName: record.akiyaCase.user.name,
        propertyAddress: record.akiyaCase.propertyAddress,
        performedAt: record.performedAt,
        storeName: record.akiyaCase.store.name,
        reportUrl: url,
      })
      if (!emailSent) emailError = 'メール設定が未構成のため送信できませんでした'
    } catch (e) {
      console.error('[akiya-report] メール送信に失敗:', e)
      emailError = 'メール送信中にエラーが発生しました'
    }
  } else {
    emailError = '顧客にメールアドレスが登録されていません'
  }

  const updated = await prisma.akiyaRecord.update({
    where: { id: recordId },
    data: {
      reportToken: token,
      // 提出日時は初回のみ記録（再送では上書きしない）
      reportSubmittedAt: record.reportSubmittedAt ?? new Date(),
      ...(emailSent ? { reportSentTo: customerEmail, reportSentAt: new Date() } : {}),
    },
    select: { reportSubmittedAt: true, reportSentTo: true, reportSentAt: true },
  })

  await recordAccessLog({
    userType: sessionUser.role, userId: sessionUser.id, userName: sessionUser.name,
    memberId: sessionUser.memberId ?? null,
    action: `空き家管理レポートを提出${emailSent ? `（${customerEmail}へ送信）` : '（メール送信なし）'}`,
    req: request,
  })

  return NextResponse.json({
    url,
    emailSent,
    emailError,
    sentTo: updated.reportSentTo,
    sentAt: updated.reportSentAt,
    submittedAt: updated.reportSubmittedAt,
  })
}
