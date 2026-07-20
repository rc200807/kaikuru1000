// 分析画面のAI機能（サーバー専用）: プロンプト集約 + Gemini呼び出し。
// 数値計算は stats.ts / 呼び出し元で行い、AIには解釈・文章化だけをさせる。
import { callGeminiJson } from '@/lib/gemini'
import type { AnalyticsResponse } from '@/lib/analytics/types'
import type {
  TabInsight, AiInsightItem, ChatResult, ReportResult, DiagnosisResult,
  ExplainPointResult, TextMiningResult,
} from '@/lib/analytics/types'

/* ─── データ圧縮（プロンプト肥大対策） ─── */

const MAX_TABLE_ROWS = 15
const MAX_SERIES_POINTS = 60

function roundValue(v: unknown): unknown {
  if (typeof v === 'number') return Number.isInteger(v) ? v : Math.round(v * 1000) / 1000
  return v
}

function compactRecord<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) {
    if (v === null || v === undefined) continue
    out[k] = roundValue(v)
  }
  return out
}

/** AnalyticsResponse をプロンプト向けに切り詰める */
export function compactAnalyticsData(data: AnalyticsResponse): Record<string, unknown> {
  const kpis: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(data.kpis ?? {})) {
    kpis[k] = { value: roundValue(v.value), prev: v.compareValue !== null ? roundValue(v.compareValue) : undefined }
  }
  const series: Record<string, unknown> = {}
  for (const [k, points] of Object.entries(data.series ?? {})) {
    series[k] = points.slice(-MAX_SERIES_POINTS).map(compactRecord)
  }
  const breakdowns: Record<string, unknown> = {}
  for (const [k, items] of Object.entries(data.breakdowns ?? {})) {
    breakdowns[k] = items.slice(0, MAX_TABLE_ROWS).map(compactRecord)
  }
  const tables: Record<string, unknown> = {}
  for (const [k, rows] of Object.entries(data.tables ?? {})) {
    tables[k] = rows.slice(0, MAX_TABLE_ROWS).map(compactRecord)
  }
  return { meta: data.meta, kpis, series, breakdowns, tables }
}

/* ─── 共通ガード ─── */

function asItems(v: unknown, max = 6): AiInsightItem[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, max).map((x: any) => ({
    title: String(x?.title ?? ''),
    detail: String(x?.detail ?? ''),
    severity: ['info', 'good', 'warn', 'bad'].includes(x?.severity) ? x.severity : undefined,
  })).filter(x => x.title || x.detail)
}

function asStrings(v: unknown, max = 8): string[] {
  if (!Array.isArray(v)) return []
  return v.slice(0, max).map(x => String(x)).filter(Boolean)
}

const COMMON_RULES = `
共通ルール:
- 出力は必ず日本語。
- 数値に言及するときは、渡されたデータの実際の値を引用する（推測の数値を作らない）。金額は「¥1,234,567」または「約123万円」形式。
- ビジネス文脈: 「買いクル」は出張買取のフランチャイズ事業。案件カテゴリーは purchase=買取案件 / akikuru=アキクル案件 / ecotoku=エコトク案件。成約=contract+completed。
- 具体的で実行可能な内容にする。一般論だけの助言は避ける。`

/* ─── ① タブAIインサイト要約 ─── */

export async function generateTabInsight(tabLabel: string, periodDesc: string, compactData: unknown): Promise<TabInsight> {
  const prompt = `あなたは出張買取事業「買いクル」の経営データアナリストです。
管理画面の分析タブ「${tabLabel}」の集計データ（期間: ${periodDesc}）を読み解き、経営者向けの要約を作成してください。
${COMMON_RULES}

以下のJSON形式で返してください:
{
  "headline": "この期間の最重要ポイントを1文で（40字以内）",
  "highlights": [{"title": "見出し", "detail": "データの値を引用した説明", "severity": "good|warn|info"}],  // 注目すべき変化 2〜4件
  "anomalies": [{"title": "見出し", "detail": "説明", "severity": "warn|bad"}],  // 異常値・急変・懸念 0〜3件（なければ空配列）
  "actions": [{"title": "アクション", "detail": "具体的な進め方", "severity": "info"}]  // 推奨アクション 2〜3件
}

集計データ:
${JSON.stringify(compactData)}`

  const raw = await callGeminiJson([prompt]) as any
  return {
    headline: String(raw?.headline ?? '分析結果'),
    highlights: asItems(raw?.highlights),
    anomalies: asItems(raw?.anomalies),
    actions: asItems(raw?.actions),
  }
}

/* ─── A1 予測の講評 ─── */

export async function commentForecast(context: unknown): Promise<AiInsightItem[]> {
  const prompt = `あなたは出張買取事業「買いクル」の経営データアナリストです。
以下は月次実績と統計モデル（加重回帰）による予測です。予測値そのものは計算済みなので、変更せずに「解釈」だけを行ってください。
${COMMON_RULES}

以下のJSON形式で返してください:
{
  "commentary": [{"title": "見出し", "detail": "説明", "severity": "good|warn|info"}]  // トレンドの解釈・着地見込みの評価・注意点 2〜3件
}

データ:
${JSON.stringify(context)}`
  const raw = await callGeminiJson([prompt]) as any
  return asItems(raw?.commentary, 4)
}

/* ─── B2 異常の要因説明 ─── */

export async function explainAnomalies(anomalyList: unknown, breakdownData: unknown): Promise<{ explanations: string[]; summary: string | null }> {
  const prompt = `あなたは出張買取事業「買いクル」のデータアナリストです。
時系列データで統計的に検出された異常点（zスコア2.5以上）について、同期間の内訳データから要因を説明してください。
${COMMON_RULES}

以下のJSON形式で返してください:
{
  "explanations": ["異常点1つ目の要因説明（1〜2文）", "..."],  // 渡された異常点と同じ順序・同じ件数
  "summary": "全体を通した所見（1〜2文）"
}

検出された異常点:
${JSON.stringify(anomalyList)}

該当期間の内訳データ:
${JSON.stringify(breakdownData)}`
  const raw = await callGeminiJson([prompt]) as any
  return {
    explanations: asStrings(raw?.explanations, 5),
    summary: raw?.summary ? String(raw.summary) : null,
  }
}

/* ─── D1 チャートポイント解説 ─── */

export async function explainPoint(context: unknown): Promise<ExplainPointResult> {
  const prompt = `あなたは出張買取事業「買いクル」のデータアナリストです。
ユーザーがチャート上の特定の期間をクリックしました。その期間の詳細な内訳データから「この点で何が起きていたか」を解説してください。
${COMMON_RULES}

以下のJSON形式で返してください:
{
  "headline": "この期間に起きたことの要約（1文）",
  "findings": [{"title": "見出し", "detail": "内訳データの値を引用した説明", "severity": "info|good|warn"}]  // 2〜4件
}

コンテキストと内訳データ:
${JSON.stringify(context)}`
  const raw = await callGeminiJson([prompt]) as any
  return {
    headline: String(raw?.headline ?? ''),
    findings: asItems(raw?.findings),
  }
}

/* ─── ② チャット（2段階JSON方式） ─── */

export type ChatPlan = {
  queries: { tab: string; params: Record<string, string> }[]
  applyFilters: Record<string, string> | null
  knowledge: boolean
  directAnswer: string | null
}

export async function planChat(question: string, history: { role: string; content: string }[], contextSpec: string): Promise<ChatPlan> {
  const prompt = `あなたは出張買取事業「買いクル」の分析アシスタントの「プランナー」です。
ユーザーの質問に答えるために必要なデータクエリを設計してください。データはまだ取得しません。設計だけをJSONで返します。

${contextSpec}

判断ルール:
- データが必要な質問 → queries に最大3件のクエリを設計
- 「〜を見せて」「〜に絞って」のような画面操作の依頼 → applyFilters に画面へ適用するパラメータを設定（queriesは補助的に1件程度でよい）
- 問い合わせ内容・失注理由・相談内容などの「自由記述テキストの中身」に関する質問 → knowledge を true に
- データ不要の質問（用語の意味など） → directAnswer に回答を直接書く（この場合 queries は空配列）

以下のJSON形式で返してください:
{
  "queries": [{"tab": "overview|sales|deals|customers|stores|inventory|engagement", "params": {"preset": "...", "from": "...", "to": "...", "storeId": "...", "dealCategory": "...", "customerType": "...", "leadSource": "..."}}],
  "applyFilters": {"tab": "...", "preset": "...", "storeId": "...", ...} または null,
  "knowledge": true または false,
  "directAnswer": "データ不要の場合の回答" または null
}
paramsのキーは必要なものだけ含める。preset は today|7d|30d|this_month|last_month|this_year|all|custom（customの場合はfrom/toをyyyy-MM-dd形式で）。

これまでの会話:
${JSON.stringify(history.slice(-6))}

ユーザーの質問: ${question}`
  const raw = await callGeminiJson([prompt]) as any
  const queries = Array.isArray(raw?.queries)
    ? raw.queries.slice(0, 3).map((q: any) => ({
        tab: String(q?.tab ?? 'overview'),
        params: typeof q?.params === 'object' && q.params ? Object.fromEntries(Object.entries(q.params).map(([k, v]) => [k, String(v)])) : {},
      }))
    : []
  const applyFilters = typeof raw?.applyFilters === 'object' && raw?.applyFilters
    ? Object.fromEntries(Object.entries(raw.applyFilters).map(([k, v]) => [k, String(v)]))
    : null
  return {
    queries,
    applyFilters,
    knowledge: raw?.knowledge === true,
    directAnswer: raw?.directAnswer ? String(raw.directAnswer) : null,
  }
}

export async function answerChat(
  question: string,
  history: { role: string; content: string }[],
  gathered: { label: string; data: unknown }[],
  appliedFilters: Record<string, string> | null,
): Promise<ChatResult> {
  const prompt = `あなたは出張買取事業「買いクル」の分析アシスタントです。取得済みのデータに基づいてユーザーの質問に答えてください。
${COMMON_RULES}
- データにない情報は「データからは分かりません」と正直に答える。
- 回答は簡潔に（長くても400字程度）。箇条書きは「・」を使う。

以下のJSON形式で返してください:
{ "answer": "回答本文" }

これまでの会話:
${JSON.stringify(history.slice(-6))}

取得したデータ:
${JSON.stringify(gathered)}

${appliedFilters ? `補足: 画面のフィルタを ${JSON.stringify(appliedFilters)} に切り替え済みです。回答の冒頭で一言触れてください。` : ''}
ユーザーの質問: ${question}`
  const raw = await callGeminiJson([prompt]) as any
  return {
    answer: String(raw?.answer ?? '回答を生成できませんでした'),
    usedData: gathered.map(g => g.label),
    appliedFilters,
  }
}

/* ─── ③ レポート / B1 週次ダイジェスト ─── */

export async function generateReport(kindLabel: string, periodLabel: string, tabs: { label: string; data: unknown }[]): Promise<ReportResult> {
  const prompt = `あなたは出張買取事業「買いクル」の経営企画室のアナリストです。
全タブの集計データから、経営会議向けの${kindLabel}（対象期間: ${periodLabel}）を作成してください。
${COMMON_RULES}

以下のJSON形式で返してください:
{
  "title": "レポートタイトル（期間を含む）",
  "summary": "エグゼクティブサマリー（3〜5文。最重要の数値と変化を含める）",
  "sections": [{"heading": "セクション見出し", "body": "本文（2〜4文）", "bullets": ["要点1", "要点2"]}],  // 売上・案件・顧客・店舗・流入の観点で4〜6セクション
  "risks": ["リスク・懸念事項"],  // 1〜3件
  "nextActions": ["来期の重点アクション"]  // 2〜4件
}

集計データ（タブ別）:
${JSON.stringify(tabs)}`
  const raw = await callGeminiJson([prompt]) as any
  return {
    title: String(raw?.title ?? `${kindLabel}（${periodLabel}）`),
    summary: String(raw?.summary ?? ''),
    sections: Array.isArray(raw?.sections)
      ? raw.sections.slice(0, 8).map((s: any) => ({
          heading: String(s?.heading ?? ''),
          body: String(s?.body ?? ''),
          bullets: asStrings(s?.bullets, 6),
        }))
      : [],
    risks: asStrings(raw?.risks, 4),
    nextActions: asStrings(raw?.nextActions, 5),
  }
}

/* ─── ④ 店舗診断 ─── */

export async function diagnoseStoreAi(storeName: string, storeData: unknown, benchmarkData: unknown): Promise<DiagnosisResult> {
  const prompt = `あなたは出張買取フランチャイズ「買いクル」のスーパーバイザーです。
店舗「${storeName}」の実績を全店舗ベンチマークと比較し、診断カルテを作成してください。
${COMMON_RULES}
- 必ず全店舗平均・上位店舗との具体的な数値比較を含める。

以下のJSON形式で返してください:
{
  "score": 65,  // 総合評価 0〜100（ベンチマーク比。平均的なら50前後）
  "summary": "総評（2〜3文）",
  "strengths": [{"title": "強み", "detail": "数値根拠つき説明", "severity": "good"}],  // 1〜3件
  "weaknesses": [{"title": "弱み", "detail": "数値根拠つき説明", "severity": "bad"}],  // 1〜3件
  "opportunities": [{"title": "機会", "detail": "説明", "severity": "info"}],  // 1〜2件
  "actions": [{"title": "改善アクション", "detail": "具体的な進め方", "severity": "info"}]  // 2〜3件
}

対象店舗のデータ:
${JSON.stringify(storeData)}

全店舗ベンチマーク:
${JSON.stringify(benchmarkData)}`
  const raw = await callGeminiJson([prompt]) as any
  const score = Number(raw?.score)
  return {
    score: Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : 50,
    summary: String(raw?.summary ?? ''),
    strengths: asItems(raw?.strengths, 4),
    weaknesses: asItems(raw?.weaknesses, 4),
    opportunities: asItems(raw?.opportunities, 3),
    actions: asItems(raw?.actions, 4),
  }
}

/* ─── A3 店舗不調予兆 ─── */

export async function commentStoreAlerts(alertRows: unknown): Promise<{ summary: string; perStore: { hypothesis: string; action: string }[] }> {
  const prompt = `あなたは出張買取フランチャイズ「買いクル」のスーパーバイザーです。
直近4週間と、その前の4週間を比較して悪化が検出された店舗のリストです。各店舗について不調の理由仮説と初動アクションを提案してください。
${COMMON_RULES}

以下のJSON形式で返してください:
{
  "summary": "全体所見（1〜2文）",
  "perStore": [{"hypothesis": "理由仮説（1〜2文）", "action": "初動アクション（1文）"}]  // 渡された店舗と同じ順序・同じ件数
}

悪化検出店舗:
${JSON.stringify(alertRows)}`
  const raw = await callGeminiJson([prompt]) as any
  return {
    summary: String(raw?.summary ?? ''),
    perStore: Array.isArray(raw?.perStore)
      ? raw.perStore.map((p: any) => ({ hypothesis: String(p?.hypothesis ?? ''), action: String(p?.action ?? '') }))
      : [],
  }
}

/* ─── C1 テキストマイニング / ナレッジ ─── */

export async function mineTexts(texts: { source: string; text: string }[], periodLabel: string): Promise<TextMiningResult> {
  const prompt = `あなたは出張買取事業「買いクル」のVOC（顧客の声）アナリストです。
期間「${periodLabel}」に記録された自由記述テキスト（問い合わせ内容・案件メモ・買取相談・失注案件メモ）を分析し、テーマ分類と示唆を抽出してください。
${COMMON_RULES}
- 個人名・電話番号・住所は出力に含めない。
- examplesは元テキストの要約・言い換えでよい（そのまま引用しなくてよい）。

以下のJSON形式で返してください:
{
  "themes": [{"name": "テーマ名", "count": 12, "examples": ["代表例の要約1", "代表例の要約2"], "insight": "このテーマからの示唆（1文）"}],  // 件数の多い順に3〜7テーマ
  "lostReasons": [{"name": "失注理由", "count": 3, "detail": "説明と対策（1〜2文）"}],  // source=lost のテキストから。なければ空配列
  "insights": ["全体を通した重要な発見・提言"]  // 2〜4件
}

テキストデータ（source: inquiry=問い合わせ, deal=案件メモ, memo=買取相談, lost=失注案件メモ）:
${JSON.stringify(texts)}`
  const raw = await callGeminiJson([prompt]) as any
  return {
    themes: Array.isArray(raw?.themes)
      ? raw.themes.slice(0, 8).map((t: any) => ({
          name: String(t?.name ?? ''),
          count: Number(t?.count) || 0,
          examples: asStrings(t?.examples, 3),
          insight: String(t?.insight ?? ''),
        }))
      : [],
    lostReasons: Array.isArray(raw?.lostReasons)
      ? raw.lostReasons.slice(0, 6).map((r: any) => ({
          name: String(r?.name ?? ''),
          count: Number(r?.count) || 0,
          detail: String(r?.detail ?? ''),
        }))
      : [],
    insights: asStrings(raw?.insights, 5),
    analyzedCount: texts.length,
  }
}

/* ─── C2 RFMの打ち手提案 ─── */

export async function adviseRfm(segments: unknown): Promise<{ summary: string; advices: string[] }> {
  const prompt = `あなたは出張買取事業「買いクル」のCRMコンサルタントです。
訪問サイクル基準で自動分類した顧客セグメント（RFM）の結果です。各セグメントへの具体的な打ち手を提案してください。
${COMMON_RULES}

以下のJSON形式で返してください:
{
  "summary": "顧客構成の全体評価（1〜2文）",
  "advices": ["セグメント1つ目への打ち手（1〜2文）", "..."]  // 渡されたセグメントと同じ順序・同じ件数
}

セグメント（key: vip=優良, stable=安定, growing=育成中, at_risk=離反危機, dormant=休眠, new=未取引）:
${JSON.stringify(segments)}`
  const raw = await callGeminiJson([prompt]) as any
  return {
    summary: String(raw?.summary ?? ''),
    advices: asStrings(raw?.advices, 8),
  }
}

/* ─── D3 What-if の施策提案 ─── */

export async function adviseWhatIf(context: unknown): Promise<{ summary: string; suggestions: AiInsightItem[] }> {
  const prompt = `あなたは出張買取事業「買いクル」の経営コンサルタントです。
What-ifシミュレーション（試算値は計算済み・変更禁止）の結果を踏まえ、この改善を実現するための具体的な施策を提案してください。
${COMMON_RULES}

以下のJSON形式で返してください:
{
  "summary": "この試算の評価（実現可能性・インパクト。1〜2文）",
  "suggestions": [{"title": "施策", "detail": "具体的な進め方", "severity": "info"}]  // 2〜4件
}

シミュレーション内容と結果:
${JSON.stringify(context)}`
  const raw = await callGeminiJson([prompt]) as any
  return {
    summary: String(raw?.summary ?? ''),
    suggestions: asItems(raw?.suggestions, 4),
  }
}
