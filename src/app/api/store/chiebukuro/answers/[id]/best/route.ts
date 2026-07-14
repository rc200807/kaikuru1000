import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getStoreContext } from '@/lib/chat'

/** ベストアンサーの選定/解除（質問の投稿店舗のみ） */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getStoreContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const answer = await prisma.answer.findUnique({
    where: { id },
    select: { id: true, isBest: true, questionId: true, question: { select: { storeId: true } } },
  })
  if (!answer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (answer.question.storeId !== ctx.storeId) {
    return NextResponse.json({ error: 'ベストアンサーの選定は質問した店舗のみ可能です' }, { status: 403 })
  }

  if (answer.isBest) {
    // 解除
    await prisma.answer.update({ where: { id }, data: { isBest: false } })
    await prisma.question.update({ where: { id: answer.questionId }, data: { isResolved: false } })
    return NextResponse.json({ isBest: false })
  }
  // 同一質問の他回答を解除し、この回答をベストに
  await prisma.answer.updateMany({ where: { questionId: answer.questionId }, data: { isBest: false } })
  await prisma.answer.update({ where: { id }, data: { isBest: true } })
  await prisma.question.update({ where: { id: answer.questionId }, data: { isResolved: true } })
  return NextResponse.json({ isBest: true })
}
