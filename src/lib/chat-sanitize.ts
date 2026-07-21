/**
 * 本部⇄店舗チャット本文（HTML）のサニタイズ／テキスト化ユーティリティ。
 *
 * チャット本文は TipTap の getHTML() で保存する（プレーン → HTML への移行）。
 * 一般ユーザーの投稿を含むため、保存時・表示時の二重でサニタイズする。
 * - sanitizeChatHtml: 許可タグ/属性のみ残す。リンクは target/rel を強制付与。
 * - chatHtmlToText: プレビュー（ルーム一覧・ダッシュボード）用にタグを除去して平文化。
 * - isEmptyChatHtml: 実質的に空か（<p></p> のみ等）を判定。
 */

import DOMPurify from 'isomorphic-dompurify'

// 許可タグ（装飾・リスト・引用・コード・メンション用 span）
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
  'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'span',
]
// data-* 属性は ALLOW_DATA_ATTR（既定 true）で許可されるため、明示は href/target/rel/class のみ
const ALLOWED_ATTR = ['href', 'target', 'rel', 'class']

// リンクに target/rel を強制するフック（javascript: 等の危険スキームは DOMPurify 既定で除去される）
let hookAdded = false
function ensureHook() {
  if (hookAdded) return
  hookAdded = true
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    const el = node as unknown as Element
    if (el.tagName === 'A') {
      el.setAttribute('target', '_blank')
      el.setAttribute('rel', 'noopener noreferrer nofollow')
    }
  })
}

/** チャットHTMLを許可リストでサニタイズ。空相当なら空文字を返す。 */
export function sanitizeChatHtml(html: string | null | undefined): string {
  if (!html) return ''
  ensureHook()
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
  }).trim()
  if (isEmptyChatHtml(clean)) return ''
  return clean
}

/** 実質的に空か（タグを除いた可視テキストが無い）を判定 */
export function isEmptyChatHtml(html: string | null | undefined): boolean {
  if (!html) return true
  const text = html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, '')
    .replace(/\s+/g, '')
  return text.length === 0
}

/** プレビュー用: HTML からタグを除去し実体参照をデコードした平文を返す */
export function chatHtmlToText(html: string | null | undefined): string {
  if (!html) return ''
  let s = html
  // 改行・ブロック終端を空白へ
  s = s.replace(/<\s*br\s*\/?>/gi, ' ')
  s = s.replace(/<\/(p|div|li|blockquote|h[1-6]|pre)>/gi, ' ')
  // 残りのタグを除去（メンション span はテキストに @名前 を含むためそのまま残る）
  s = s.replace(/<[^>]+>/g, '')
  // 実体参照デコード（&amp; は二重デコードを避けるため最後に処理）
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
  s = s.replace(/&#(\d+);/g, (_, d) => {
    try { return String.fromCodePoint(Number(d)) } catch { return '' }
  })
  s = s.replace(/&#x([0-9a-f]+);/gi, (_, h) => {
    try { return String.fromCodePoint(parseInt(h, 16)) } catch { return '' }
  })
  s = s.replace(/&amp;/gi, '&')
  return s.replace(/\s+/g, ' ').trim()
}
