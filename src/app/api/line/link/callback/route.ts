import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  exchangeCode,
  getLoginProfile,
  getFriendshipStatus,
  getDecryptedLoginSecret,
} from '@/lib/line-login'

// GET /api/line/link/callback — LINE Login の認可コールバック（公開API）
// state（LineLinkToken）を検証し、LINE userId を取得して LineUser と顧客を自動紐付けする。
// 完了後は公開の完了ページへリダイレクトする。
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const oauthError = searchParams.get('error')

  // state からトークンを引く（storeCode をリダイレクト先の組み立てに使うため最初に解決）
  const linkToken = state
    ? await prisma.lineLinkToken.findUnique({ where: { token: state } })
    : null

  const store = linkToken
    ? await prisma.store.findUnique({
        where: { id: linkToken.storeId },
        select: { code: true },
      })
    : null

  const completeBase = store ? `/line/${store.code}/complete` : '/'

  const redirectTo = (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString()
    return NextResponse.redirect(new URL(`${completeBase}?${qs}`, request.url))
  }

  try {
    // ユーザーが同意画面でキャンセルした場合など
    if (oauthError) {
      return redirectTo({ error: 'cancelled' })
    }
    if (!code || !state || !linkToken || !store) {
      return redirectTo({ error: 'invalid' })
    }

    // --- state 検証（未使用・期限内）---
    if (linkToken.usedAt) {
      return redirectTo({ error: 'used' })
    }
    if (linkToken.expiresAt < new Date()) {
      return redirectTo({ error: 'expired' })
    }

    const channel = await prisma.lineChannel.findUnique({
      where: { id: linkToken.lineChannelId },
    })
    if (!channel || !channel.isActive || !channel.loginChannelId) {
      return redirectTo({ error: 'channel' })
    }
    const loginSecret = getDecryptedLoginSecret(channel)
    if (!loginSecret) {
      return redirectTo({ error: 'channel' })
    }

    // --- 使用済みマーク（リプレイ防止）: 交換処理の前に確定させる ---
    await prisma.lineLinkToken.update({
      where: { id: linkToken.id },
      data: { usedAt: new Date() },
    })

    // --- code → アクセストークン交換 → プロフィール取得 ---
    const tokenResult = await exchangeCode(code, channel.loginChannelId, loginSecret)
    if (!tokenResult) {
      return redirectTo({ error: 'auth' })
    }
    const profile = await getLoginProfile(tokenResult.accessToken)
    if (!profile) {
      return redirectTo({ error: 'auth' })
    }

    // --- LineUser upsert（既に友だち・トーク済みでも顧客紐付けと店舗割当を確定させる）---
    const lineUser = await prisma.lineUser.upsert({
      where: {
        lineUserId_lineChannelId: {
          lineUserId: profile.userId,
          lineChannelId: channel.id,
        },
      },
      create: {
        lineUserId: profile.userId,
        displayName: profile.displayName || 'LINEユーザー',
        pictureUrl: profile.pictureUrl || null,
        lineChannelId: channel.id,
        userId: linkToken.userId,
        storeId: linkToken.storeId,
        registeredAt: new Date(),
      },
      update: {
        displayName: profile.displayName || undefined,
        pictureUrl: profile.pictureUrl || undefined,
        userId: linkToken.userId,
        storeId: linkToken.storeId,
        registeredAt: new Date(),
      },
    })

    // --- 「LINE登録フォーム完了」トリガーのシナリオへ enroll（失敗しても登録自体は成功させる）---
    // 契約書・見積書のQR連携（purpose=contract/estimate）はフォーム登録ではないため対象外
    if (linkToken.purpose === 'register') {
      try {
        const { enrollByTrigger } = await import('@/lib/line-scenario')
        await enrollByTrigger('registration', lineUser)
      } catch (e) {
        console.error('[line/link/callback] registration enroll failed', e)
      }
    }

    // --- 契約書・見積書のQR連携なら、連携完了と同時に書類の閲覧リンクを自動送付 ---
    let docSent: 'true' | 'false' | null = null
    if ((linkToken.purpose === 'contract' || linkToken.purpose === 'estimate') && linkToken.visitScheduleId) {
      try {
        const { sendDocumentViaLine } = await import('@/lib/line-document')
        const sendResult = await sendDocumentViaLine(linkToken.visitScheduleId, linkToken.purpose, lineUser.id)
        docSent = sendResult.ok ? 'true' : 'false'
        if (!sendResult.ok) {
          console.error('[line/link/callback] document send failed:', sendResult.error)
        }
      } catch (e) {
        docSent = 'false'
        console.error('[line/link/callback] document send failed', e)
      }
    }

    // --- 友だち状態を確認して完了ページへ ---
    const isFriend = await getFriendshipStatus(tokenResult.accessToken)
    return redirectTo({
      friend: isFriend ? 'true' : 'false',
      ...(docSent !== null ? { doc: linkToken.purpose, sent: docSent } : {}),
    })
  } catch (error) {
    console.error('[line/link/callback] error:', error)
    return redirectTo({ error: 'server' })
  }
}
