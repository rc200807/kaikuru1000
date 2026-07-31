/**
 * ナレッジベース（FAQ）本文のサニタイズ。
 *
 * 執筆者は管理者に限られるが、店舗ポータルにも表示されるため保存時・表示時の
 * 二重でサニタイズする。チャットと違い RichTextEditor が見出し・画像・水平線を
 * 出力するので、その分だけ許可タグを広げている。
 * 解析ロジックは html-sanitize.ts と共有（DOMPurify 系は Vercel で落ちるため使わない）。
 */
import { sanitizeHtml, isEmptyHtml, htmlToText, type SanitizeConfig } from './html-sanitize'

const FAQ_CONFIG: SanitizeConfig = {
  allowedTags: new Set([
    'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
    'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'span',
    // RichTextEditor が出力する見出し・画像
    'h1', 'h2', 'h3', 'h4',
    'img',
  ]),
  allowedAttrs: {
    a: new Set(['href', 'class']),
    span: new Set(['class']),
    img: new Set(['src', 'alt', 'class', 'width', 'height']),
    p: new Set(['class']),
    h1: new Set(['class']), h2: new Set(['class']), h3: new Set(['class']), h4: new Set(['class']),
    ul: new Set(['class']), ol: new Set(['class']), li: new Set(['class']),
    blockquote: new Set(['class']), pre: new Set(['class']), code: new Set(['class']),
  },
  // FAQ では data-* を許可する必要がない（メンション機能を持たないため）
  dataAttrTags: new Set(),
  urlAttrs: new Set(['href', 'src']),
  // 画像・水平線だけの本文が「空」と判定されて消えないようにする
  contentTags: new Set(['img', 'hr']),
}

/** FAQ本文のHTMLを許可リストでサニタイズ。空相当なら空文字を返す。 */
export function sanitizeFaqHtml(html: string | null | undefined): string {
  return sanitizeHtml(html, FAQ_CONFIG)
}

/** 実質的に空か判定（画像・水平線だけでも「中身あり」とみなす） */
export function isEmptyFaqHtml(html: string | null | undefined): boolean {
  return isEmptyHtml(html, FAQ_CONFIG.contentTags)
}

/** AIへの入力・一覧のプレビュー用に平文化する */
export function faqHtmlToText(html: string | null | undefined): string {
  return htmlToText(html)
}
