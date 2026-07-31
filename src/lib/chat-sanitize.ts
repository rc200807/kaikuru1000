/**
 * 本部⇄店舗チャット本文（HTML）のサニタイズ／テキスト化ユーティリティ。
 *
 * チャット本文は TipTap の getHTML() で保存する（プレーン → HTML への移行）。
 * 一般ユーザーの投稿を含むため、保存時・表示時の二重でサニタイズする。
 *
 * 解析ロジックは html-sanitize.ts に集約し、ここでは許可タグ／属性だけを定義する。
 * （FAQ本文の faq-sanitize.ts と同じ実装を共有し、セキュリティ修正の当て漏れを防ぐ）
 */
import { sanitizeHtml, isEmptyHtml, htmlToText, type SanitizeConfig } from './html-sanitize'

// 許可タグ（装飾・リスト・引用・コード・メンション用 span）
const CHAT_CONFIG: SanitizeConfig = {
  allowedTags: new Set([
    'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
    'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'span',
  ]),
  // タグごとの許可属性（data-* は span のみ別途許可）。ここに無い属性はすべて除去。
  allowedAttrs: {
    a: new Set(['href', 'class']),
    span: new Set(['class']),
  },
  dataAttrTags: new Set(['span']),
  urlAttrs: new Set(['href']),
}

/** チャットHTMLを許可リストでサニタイズ。空相当なら空文字を返す。 */
export function sanitizeChatHtml(html: string | null | undefined): string {
  return sanitizeHtml(html, CHAT_CONFIG)
}

/** 実質的に空か（タグを除いた可視テキストが無い）を判定 */
export function isEmptyChatHtml(html: string | null | undefined): boolean {
  return isEmptyHtml(html)
}

/** プレビュー用: HTML からタグを除去し実体参照をデコードした平文を返す */
export function chatHtmlToText(html: string | null | undefined): string {
  return htmlToText(html)
}
