/**
 * 本部⇄店舗チャット本文（HTML）のサニタイズ／テキスト化ユーティリティ。
 *
 * チャット本文は TipTap の getHTML() で保存する（プレーン → HTML への移行）。
 * 一般ユーザーの投稿を含むため、保存時・表示時の二重でサニタイズする。
 *
 * 実装メモ: 以前は isomorphic-dompurify を使っていたが、依存する jsdom が
 * Vercel のサーバーレス実行時に ERR_REQUIRE_ESM で落ち、これを import する
 * 全APIが500になった。そのため **外部依存なしの純JS実装** に置き換えている。
 * サーバー/クライアントの両方で同一挙動。表示時はクライアントで再度この関数を通す
 * （多層防御）。許可タグ/属性のみ残し、リンクは target/rel を強制、危険スキームは除去。
 */

// 許可タグ（装飾・リスト・引用・コード・メンション用 span）
const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
  'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'span',
])

// タグごとの許可属性（data-* は span のみ別途許可）。ここに無い属性はすべて除去。
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'class']),
  span: new Set(['class']),
}

// script/style 等は「タグごと中身も」除去する危険要素
const DANGEROUS_BLOCK = /<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'`=<>]+))?/g

/** テキスト片のエスケープ（< > のみ。& は既存の実体参照を壊さないため触らない） */
function escapeText(t: string): string {
  return t.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 属性値のエスケープ（" < > のみ。& は二重エンコード回避のため触らない） */
function escapeAttr(v: string): string {
  return v.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** href を安全なスキームのみ許可（javascript:/data: 等は null＝除去）。安全なら原値を返す。 */
function safeHref(raw: string): string | null {
  const v = raw.trim()
  // スキームを隠す実体参照をデコードしてから判定
  const decoded = v
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)) } catch { return '' } })
    .replace(/&#(\d+);?/g, (_, d) => { try { return String.fromCodePoint(Number(d)) } catch { return '' } })
    .replace(/&colon;/gi, ':')
  // 制御文字・空白（タブ/改行含む）を除去してスキーム偽装（例: "java\tscript:"）を防ぐ
  const normalized = decoded.replace(/[\u0000-\u0020]+/g, '').toLowerCase()
  if (normalized === '') return null
  // 相対パス・アンカーは許可
  if (normalized[0] === '#' || normalized[0] === '/' || normalized.startsWith('./') || normalized.startsWith('../')) return v
  const sm = normalized.match(/^([a-z][a-z0-9+.\-]*):/)
  if (!sm) return v // スキームなし＝相対URL
  return ['http', 'https', 'mailto', 'tel'].includes(sm[1]) ? v : null
}

/** 開始タグを許可属性のみで再構築 */
function buildOpenTag(name: string, attrsRaw: string): string {
  const allowed = ALLOWED_ATTRS[name]
  const isSpan = name === 'span'
  const isAnchor = name === 'a'
  const parts: string[] = []

  if (attrsRaw) {
    ATTR_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = ATTR_RE.exec(attrsRaw)) !== null) {
      const attr = m[1].toLowerCase()
      let val = m[2] ?? ''
      if (val && (val[0] === '"' || val[0] === "'")) val = val.slice(1, -1)

      if (attr.startsWith('on') || attr === 'style') continue // イベントハンドラ・style は常に除去
      const isData = attr.startsWith('data-')
      if (isData) {
        if (!isSpan) continue // data-* は span（メンション）のみ許可
      } else if (!(allowed && allowed.has(attr))) {
        continue
      }

      if (attr === 'href') {
        const safe = safeHref(val)
        if (safe == null) continue
        parts.push(`href="${escapeAttr(safe)}"`)
        continue
      }
      parts.push(`${attr}="${escapeAttr(val)}"`)
    }
  }

  // リンクは target/rel を強制（javascript: 等は既に除去済み）
  if (isAnchor) parts.push('target="_blank"', 'rel="noopener noreferrer nofollow"')

  return parts.length ? `<${name} ${parts.join(' ')}>` : `<${name}>`
}

/** 単一タグ（< > の中身）を解析 */
function parseTag(inner: string): { closing: boolean; name: string; attrs: string } | null {
  const closing = inner[0] === '/'
  const body = closing ? inner.slice(1) : inner
  const nameMatch = body.match(/^\s*([a-zA-Z][a-zA-Z0-9]*)/)
  if (!nameMatch) return null
  return { closing, name: nameMatch[1].toLowerCase(), attrs: body.slice(nameMatch[0].length) }
}

/** チャットHTMLを許可リストでサニタイズ。空相当なら空文字を返す。 */
export function sanitizeChatHtml(html: string | null | undefined): string {
  if (!html) return ''
  let src = String(html)
  // コメント・危険要素（中身ごと）を除去
  src = src.replace(/<!--[\s\S]*?-->/g, '')
  src = src.replace(DANGEROUS_BLOCK, '')

  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const lt = src.indexOf('<', i)
    if (lt === -1) { out += escapeText(src.slice(i)); break }
    out += escapeText(src.slice(i, lt)) // '<' 直前までのテキスト
    const gt = src.indexOf('>', lt + 1)
    if (gt === -1) { out += escapeText(src.slice(lt)); break } // 閉じ '>' が無い＝残りはテキスト扱い
    const parsed = parseTag(src.slice(lt + 1, gt))
    if (parsed && ALLOWED_TAGS.has(parsed.name)) {
      out += parsed.closing ? `</${parsed.name}>` : buildOpenTag(parsed.name, parsed.attrs)
    }
    // 許可外/不正タグはマークアップのみ除去（内側テキストは残る）
    i = gt + 1
  }

  if (isEmptyChatHtml(out)) return ''
  return out.trim()
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
