// ナレッジベースAIチャットの中核。管理・店舗の両ルートがこれを共有し、挙動が分岐しないようにする。
//
// 検索方式: 登録済みFAQを「まとめてプロンプトに渡す」。
//   FAQは現実的に数十〜数百件で gemini-2.5-flash の文脈長に対して十分小さく、
//   全件渡したほうが検索漏れがなく回答品質も高い。embedding や外部ベクタDBは使わない。
//   ただし件数が増えても黙って壊れないよう、文字数バジェットを超えたら関連度順に絞る。
//   将来 embedding へ差し替える場合も selectFaqContext() の中だけで済むようにしている。
import { prisma } from './prisma'
import { callGeminiJson } from './gemini'
import { faqHtmlToText } from './faq-sanitize'
import { MAX_STORED_MESSAGES, type KnowledgeChatMessage } from './knowledge'
import type { KnowledgeViewer } from './knowledge-api'

/** プロンプトに載せるFAQ本文の合計文字数の上限 */
const FAQ_CONTEXT_BUDGET = 60_000
/** 1件のFAQ本文の上限（極端に長い回答が全体を食い潰さないように） */
const FAQ_ANSWER_MAX_CHARS = 4_000
/** 1件の資料（PDF等）から使う抽出テキストの上限。FAQより長く許容する */
const DOCUMENT_TEXT_MAX_CHARS = 20_000
/** 資料のFAQ_IDに付ける接頭辞。実在するFaqのcuidと衝突しない固定文字列 */
const DOCUMENT_ID_PREFIX = 'doc:'
/** プロンプトに載せる会話履歴のメッセージ数 */
const HISTORY_LIMIT = 16
/** 1利用者あたり1日の質問回数上限（コストの防波堤） */
const DAILY_QUESTION_LIMIT = 50

export type FaqForContext = {
  id: string
  question: string
  answer: string
  categoryName: string | null
}

export type AskResult = {
  answer: string
  usedFaqIds: string[]
  answered: boolean
}

// ─── FAQの選定 ──────────────────────────────────────────

/** 文字bigramの集合。日本語を形態素解析器なしで比較するための簡易表現 */
function bigrams(text: string): Set<string> {
  const s = text.replace(/\s+/g, '')
  const out = new Set<string>()
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2))
  if (s.length === 1) out.add(s)
  return out
}

/** 質問とFAQの関連度（0〜1）。質問側のbigramがどれだけFAQに含まれるか */
function relevance(questionGrams: Set<string>, faq: FaqForContext): number {
  if (questionGrams.size === 0) return 0
  const target = bigrams(`${faq.question} ${faq.answer}`)
  let hit = 0
  for (const g of questionGrams) if (target.has(g)) hit++
  return hit / questionGrams.size
}

function faqCost(faq: FaqForContext): number {
  return faq.question.length + faq.answer.length + 40
}

/**
 * プロンプトに載せるFAQを選ぶ。
 * バジェット内なら全件、超える場合のみ質問との関連度が高い順に詰める。
 */
export function selectFaqContext(
  question: string,
  faqs: FaqForContext[],
  budget = FAQ_CONTEXT_BUDGET,
): FaqForContext[] {
  const total = faqs.reduce((sum, f) => sum + faqCost(f), 0)
  if (total <= budget) return faqs

  const grams = bigrams(question)
  const ranked = [...faqs]
    .map(f => ({ f, score: relevance(grams, f) }))
    .sort((a, b) => b.score - a.score)

  const picked: FaqForContext[] = []
  let used = 0
  for (const { f } of ranked) {
    const cost = faqCost(f)
    if (used + cost > budget) continue
    picked.push(f)
    used += cost
  }
  return picked
}

/** DBから参照可能なFAQを取得し、プロンプト用に平文化する */
export async function loadFaqsForViewer(viewer: KnowledgeViewer): Promise<FaqForContext[]> {
  const faqs = await prisma.faq.findMany({
    where: {
      isPublished: true,
      // 店舗には「管理者のみ」のFAQを一切見せない
      ...(viewer.canSeeAdminOnly ? {} : { visibility: 'all' }),
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true, question: true, answer: true,
      category: { select: { name: true } },
    },
  })

  return faqs.map(f => ({
    id: f.id,
    question: f.question,
    answer: faqHtmlToText(f.answer).slice(0, FAQ_ANSWER_MAX_CHARS),
    categoryName: f.category?.name ?? null,
  }))
}

/** 資料のIDを "doc:xxx" 形式にする / 判定する。Faqのcuidと衝突しない前提の固定接頭辞 */
export function isDocumentContextId(id: string): boolean {
  return id.startsWith(DOCUMENT_ID_PREFIX)
}
export function documentIdFromContextId(id: string): string {
  return id.slice(DOCUMENT_ID_PREFIX.length)
}
export function contextIdForDocument(id: string): string {
  return `${DOCUMENT_ID_PREFIX}${id}`
}

/**
 * DBから参照可能な資料（PDF等）を取得し、FAQと同じ FaqForContext 形状で返す。
 * こうすると selectFaqContext / buildPrompt / 引用IDの検証をそのまま資料にも使い回せる
 * （質問=資料タイトル、回答=抽出テキスト、IDに "doc:" を付けてFAQと区別する）。
 * 抽出がまだ済んでいない（status!=='ready'）資料は情報源にできないため除外する。
 */
export async function loadDocumentsForViewer(viewer: KnowledgeViewer): Promise<FaqForContext[]> {
  const docs = await prisma.knowledgeDocument.findMany({
    where: {
      status: 'ready',
      extractedText: { not: null },
      ...(viewer.canSeeAdminOnly ? {} : { visibility: 'all' }),
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, extractedText: true },
  })

  return docs
    .filter(d => !!d.extractedText)
    .map(d => ({
      id: `${DOCUMENT_ID_PREFIX}${d.id}`,
      question: d.title,
      answer: (d.extractedText as string).slice(0, DOCUMENT_TEXT_MAX_CHARS),
      categoryName: '資料',
    }))
}

/** チャットの情報源（FAQ＋資料）をまとめて取得する */
export async function loadKnowledgeContext(viewer: KnowledgeViewer): Promise<FaqForContext[]> {
  const [faqs, docs] = await Promise.all([loadFaqsForViewer(viewer), loadDocumentsForViewer(viewer)])
  return [...faqs, ...docs]
}

// ─── Gemini への問い合わせ ───────────────────────────────

function buildPrompt(question: string, items: FaqForContext[], history: KnowledgeChatMessage[]): string {
  const knowledge = items.length === 0
    ? '（ナレッジベースにFAQ・資料がまだ登録されていません）'
    : items.map(f => {
        const isDoc = isDocumentContextId(f.id)
        return [
          `### SOURCE_ID: ${f.id}`,
          `種別: ${isDoc ? '資料（アップロードされた文書）' : 'FAQ'}`,
          f.categoryName && !isDoc ? `カテゴリー: ${f.categoryName}` : null,
          isDoc ? `タイトル: ${f.question}` : `質問: ${f.question}`,
          isDoc ? `内容:\n${f.answer}` : `回答: ${f.answer}`,
        ].filter(Boolean).join('\n')
      }).join('\n\n')

  const historyText = history.length === 0
    ? '（なし）'
    : history.slice(-HISTORY_LIMIT).map(m => `${m.role === 'user' ? 'ユーザー' : 'アシスタント'}: ${m.content}`).join('\n')

  return `あなたは買取サービス「買いクル」社内のナレッジベース担当アシスタントです。
以下の【ナレッジベース】に登録されたFAQ・資料（アップロードされたPDF等）だけを根拠に、日本語で簡潔に回答してください。

厳守事項:
- ナレッジベースに書かれていないことは絶対に推測で答えないこと。
- 根拠が見つからない場合は answered を false にし、answer には「ナレッジベースに該当する情報が見つかりませんでした」旨と、担当者に確認するよう案内する文章を入れること。
- 回答の根拠にしたFAQ・資料の SOURCE_ID を usedFaqIds に必ず列挙すること（根拠がない場合は空配列）。
- 資料（種別が「資料」のもの）は分量が多いことがあるので、質問に関係する箇所だけを根拠に使ってよい。
- 回答は Markdown 記法を使わず、読みやすい平文で書くこと。箇条書きが必要なら「・」を使うこと。
- 挨拶や相談のような、FAQ・資料を引く必要がない発話には自然に応じてよい。その場合 answered は true、usedFaqIds は空配列にすること。

【これまでの会話】
${historyText}

【ナレッジベース】
${knowledge}

【今回の質問】
${question}

次のJSON形式のみで出力してください:
{"answer": "回答文", "usedFaqIds": ["SOURCE_ID", ...], "answered": true または false}`
}

/** Geminiに問い合わせ、AI出力を検証して返す。FAQ_IDは実在するものだけに絞る */
export async function askKnowledgeBase(params: {
  question: string
  faqs: FaqForContext[]
  history: KnowledgeChatMessage[]
}): Promise<AskResult> {
  const { question, history } = params
  const faqs = selectFaqContext(question, params.faqs)

  const raw = await callGeminiJson([buildPrompt(question, faqs, history)]) as Record<string, unknown>

  const answer = typeof raw?.answer === 'string' && raw.answer.trim()
    ? raw.answer.trim()
    : 'うまく回答を生成できませんでした。お手数ですが、質問を変えてお試しください。'

  // AI出力は信用せず、実在するFAQ_IDのみを残す（既存のホワイトリスト検証方針を踏襲）
  const validIds = new Set(faqs.map(f => f.id))
  const usedFaqIds = Array.isArray(raw?.usedFaqIds)
    ? [...new Set(raw.usedFaqIds.filter((v): v is string => typeof v === 'string' && validIds.has(v)))]
    : []

  // 根拠が1件も無いのに answered=true を返してきた場合は、AIの自己申告を尊重する
  // （挨拶などFAQ不要の発話があるため）。ただし根拠があるなら必ず answered=true に寄せる。
  const answered = usedFaqIds.length > 0 ? true : raw?.answered === true

  return { answer, usedFaqIds, answered }
}

// ─── 会話セッション ──────────────────────────────────────

export function parseMessages(json: string | null | undefined): KnowledgeChatMessage[] {
  if (!json) return []
  try {
    const arr = JSON.parse(json)
    if (!Array.isArray(arr)) return []
    return arr.filter((m): m is KnowledgeChatMessage =>
      !!m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
  } catch {
    return []
  }
}

export async function loadSession(viewer: KnowledgeViewer): Promise<KnowledgeChatMessage[]> {
  const row = await prisma.knowledgeChatSession.findUnique({
    where: { viewerType_viewerId: { viewerType: viewer.viewerType, viewerId: viewer.viewerId } },
    select: { messages: true },
  })
  return parseMessages(row?.messages)
}

export async function saveSession(viewer: KnowledgeViewer, messages: KnowledgeChatMessage[]): Promise<void> {
  // 直近のみ保持する方針なので古いメッセージは切り捨てる
  const trimmed = messages.slice(-MAX_STORED_MESSAGES)
  const payload = JSON.stringify(trimmed)
  await prisma.knowledgeChatSession.upsert({
    where: { viewerType_viewerId: { viewerType: viewer.viewerType, viewerId: viewer.viewerId } },
    update: { messages: payload, storeId: viewer.storeId },
    create: {
      viewerType: viewer.viewerType,
      viewerId: viewer.viewerId,
      storeId: viewer.storeId,
      messages: payload,
    },
  })
}

export async function clearSession(viewer: KnowledgeViewer): Promise<void> {
  await prisma.knowledgeChatSession.deleteMany({
    where: { viewerType: viewer.viewerType, viewerId: viewer.viewerId },
  })
}

// ─── ログ・レート制限 ────────────────────────────────────

export async function logQuery(viewer: KnowledgeViewer, question: string, result: AskResult): Promise<void> {
  await prisma.knowledgeQuery.create({
    data: {
      question,
      answered: result.answered,
      usedFaqIds: JSON.stringify(result.usedFaqIds),
      viewerType: viewer.viewerType,
      viewerId: viewer.viewerId,
      storeId: viewer.storeId,
    },
  })
}

/** 1日の質問回数上限に達していないか。達していれば残り0を返す */
export async function checkDailyLimit(viewer: KnowledgeViewer): Promise<{ ok: boolean; used: number; limit: number }> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const used = await prisma.knowledgeQuery.count({
    where: { viewerType: viewer.viewerType, viewerId: viewer.viewerId, createdAt: { gte: since } },
  })
  return { ok: used < DAILY_QUESTION_LIMIT, used, limit: DAILY_QUESTION_LIMIT }
}
