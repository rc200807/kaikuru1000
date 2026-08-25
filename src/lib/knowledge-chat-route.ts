// 管理・店舗のチャットAPIが共有するハンドラ本体。
// 「どちらのポータルか」だけを引数で受け、それ以外は完全に同じ処理を通す。
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from './prisma'
import { GeminiError } from './gemini'
import { resolveKnowledgeViewer, chatAskSchema } from './knowledge-api'
import type { KnowledgeChatMessage } from './knowledge'
import {
  loadKnowledgeContext, askKnowledgeBase, loadSession, saveSession, clearSession,
  logQuery, checkDailyLimit, isDocumentContextId, documentIdFromContextId, contextIdForDocument,
} from './knowledge-chat'

type Portal = 'admin' | 'store'

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

/** GET: 保存されている直近の会話を返す（参照FAQは再読込後も見えるよう質問文まで解決する） */
export async function handleChatGet(portal: Portal) {
  const viewer = await resolveKnowledgeViewer(portal)
  if (!viewer) return unauthorized()

  const messages = await loadSession(viewer)

  // 保存しているのはFAQ・資料のIDだけなので、表示用のタイトルを引き直す。
  // 参照時点から公開範囲が変わっている可能性があるため、いまの閲覧権限で再度絞る
  // （店舗に公開しなくなったFAQ・資料が、過去の会話から見え続けないようにする）。
  const ids = [...new Set(messages.flatMap(m => m.faqIds ?? []))]
  const faqIds = ids.filter(id => !isDocumentContextId(id))
  const docIds = ids.filter(isDocumentContextId).map(documentIdFromContextId)
  const faqTitleById = new Map<string, string>()
  const [faqs, docs] = await Promise.all([
    faqIds.length > 0
      ? prisma.faq.findMany({
          where: {
            id: { in: faqIds },
            isPublished: true,
            ...(viewer.canSeeAdminOnly ? {} : { visibility: 'all' }),
          },
          select: { id: true, question: true },
        })
      : Promise.resolve([]),
    docIds.length > 0
      ? prisma.knowledgeDocument.findMany({
          where: {
            id: { in: docIds },
            status: 'ready',
            ...(viewer.canSeeAdminOnly ? {} : { visibility: 'all' }),
          },
          select: { id: true, title: true },
        })
      : Promise.resolve([]),
  ])
  for (const f of faqs) faqTitleById.set(f.id, f.question)
  for (const d of docs) faqTitleById.set(contextIdForDocument(d.id), d.title)

  return NextResponse.json({
    messages: messages.map(m => ({
      role: m.role,
      content: m.content,
      answered: m.answered,
      usedFaqs: (m.faqIds ?? [])
        .filter(id => faqTitleById.has(id))
        .map(id => ({ id, question: faqTitleById.get(id)! })),
    })),
  })
}

/** POST: 質問して回答を得る */
export async function handleChatPost(portal: Portal, req: NextRequest) {
  const viewer = await resolveKnowledgeViewer(portal)
  if (!viewer) return unauthorized()

  const parsed = chatAskSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }
  const question = parsed.data.question

  const limit = await checkDailyLimit(viewer)
  if (!limit.ok) {
    return NextResponse.json(
      { error: `1日に質問できる回数の上限（${limit.limit}回）に達しました。時間をおいてからお試しください。` },
      { status: 429 },
    )
  }

  const history = await loadSession(viewer)

  try {
    const faqs = await loadKnowledgeContext(viewer)
    const result = await askKnowledgeBase({ question, faqs, history })

    const now = new Date().toISOString()
    const next: KnowledgeChatMessage[] = [
      ...history,
      { role: 'user', content: question, at: now },
      { role: 'assistant', content: result.answer, faqIds: result.usedFaqIds, answered: result.answered, at: now },
    ]

    // 保存とログはベストエフォート（失敗しても回答自体は返す）
    await Promise.all([
      saveSession(viewer, next).catch(e => console.error('[knowledge] 会話の保存に失敗:', e)),
      logQuery(viewer, question, result).catch(e => console.error('[knowledge] 質問ログの記録に失敗:', e)),
    ])

    // 根拠にしたFAQの表示用情報を添える（店舗には見せてよいものだけが faqs に入っている）
    const usedFaqs = result.usedFaqIds
      .map(id => faqs.find(f => f.id === id))
      .filter((f): f is NonNullable<typeof f> => !!f)
      .map(f => ({ id: f.id, question: f.question }))

    return NextResponse.json({
      answer: result.answer,
      answered: result.answered,
      usedFaqs,
    })
  } catch (err) {
    if (err instanceof GeminiError) {
      if (err.reason === 'no-key') {
        return NextResponse.json({ error: 'AIの設定が未完了です。管理者にお問い合わせください。' }, { status: 503 })
      }
      console.error('[knowledge] Gemini エラー:', err.message)
      return NextResponse.json({ error: 'AIの応答に失敗しました。時間をおいてお試しください。' }, { status: 502 })
    }
    console.error('[knowledge] チャット処理に失敗:', err)
    return NextResponse.json({ error: '回答の生成に失敗しました' }, { status: 500 })
  }
}

/** DELETE: 会話をリセットする（新しい会話を始める） */
export async function handleChatDelete(portal: Portal) {
  const viewer = await resolveKnowledgeViewer(portal)
  if (!viewer) return unauthorized()

  await clearSession(viewer)
  return NextResponse.json({ ok: true })
}
