/**
 * HTMLサニタイズの汎用コア（許可リスト方式）。
 *
 * チャット本文（chat-sanitize.ts）と FAQ本文（faq-sanitize.ts）が、
 * 許可タグ／属性だけを差し替えてこの実装を共有する。
 * セキュリティ上の修正が片方だけに当たる事故を防ぐため、解析ロジックは1箇所に集約する。
 *
 * 実装メモ: 以前チャットで isomorphic-dompurify を使っていたが、依存する jsdom が
 * Vercel のサーバーレス実行時に ERR_REQUIRE_ESM で落ち、これを import する全APIが
 * 500になった。そのため **外部依存なしの純JS実装** にしている。新たに DOMPurify 系を
 * 持ち込まないこと。サーバー/クライアントの両方で同一挙動。
 */

export type SanitizeConfig = {
  /** 残すタグ。ここに無いタグはマークアップのみ除去し、内側のテキストは残す */
  allowedTags: Set<string>
  /** タグごとの許可属性。ここに無い属性はすべて除去 */
  allowedAttrs: Record<string, Set<string>>
  /** data-* 属性を許可するタグ（メンション span など） */
  dataAttrTags?: Set<string>
  /** URLとして安全性を検証する属性名（既定: href / src） */
  urlAttrs?: Set<string>
  /**
   * テキストが無くても「中身がある」とみなすタグ（img / hr など）。
   * 画像だけの本文が空扱いで消えるのを防ぐ。
   */
  contentTags?: Set<string>
}

// script/style 等は「タグごと中身も」除去する危険要素
const DANGEROUS_BLOCK = /<(script|style|iframe|object|embed|noscript|template|svg|math)\b[\s\S]*?<\/\1\s*>/gi

const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("[^"]*"|'[^']*'|[^\s"'`=<>]+))?/g

const DEFAULT_URL_ATTRS = new Set(['href', 'src'])

/** テキスト片のエスケープ（< > のみ。& は既存の実体参照を壊さないため触らない） */
function escapeText(t: string): string {
  return t.replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 属性値のエスケープ（" < > のみ。& は二重エンコード回避のため触らない） */
function escapeAttr(v: string): string {
  return v.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** URLを安全なスキームのみ許可（javascript:/data: 等は null＝除去）。安全なら原値を返す。 */
export function safeUrl(raw: string): string | null {
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
function buildOpenTag(name: string, attrsRaw: string, config: SanitizeConfig): string {
  const allowed = config.allowedAttrs[name]
  const canHoldData = config.dataAttrTags?.has(name) ?? false
  const urlAttrs = config.urlAttrs ?? DEFAULT_URL_ATTRS
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
        if (!canHoldData) continue
      } else if (!(allowed && allowed.has(attr))) {
        continue
      }

      if (urlAttrs.has(attr)) {
        const safe = safeUrl(val)
        if (safe == null) continue
        parts.push(`${attr}="${escapeAttr(safe)}"`)
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

/** HTMLを許可リストでサニタイズ。空相当なら空文字を返す。 */
export function sanitizeHtml(html: string | null | undefined, config: SanitizeConfig): string {
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
    if (parsed && config.allowedTags.has(parsed.name)) {
      out += parsed.closing ? `</${parsed.name}>` : buildOpenTag(parsed.name, parsed.attrs, config)
    }
    // 許可外/不正タグはマークアップのみ除去（内側テキストは残る）
    i = gt + 1
  }

  if (isEmptyHtml(out, config.contentTags)) return ''
  return out.trim()
}

/**
 * 実質的に空か（タグを除いた可視テキストが無い）を判定。
 * contentTags を渡すと、そのタグが含まれる場合はテキストが無くても空とみなさない。
 */
export function isEmptyHtml(html: string | null | undefined, contentTags?: Set<string>): boolean {
  if (!html) return true
  if (contentTags && contentTags.size > 0) {
    for (const tag of contentTags) {
      if (new RegExp(`<${tag}\\b`, 'i').test(html)) return false
    }
  }
  const text = html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, '')
    .replace(/\s+/g, '')
  return text.length === 0
}

/** HTML からタグを除去し実体参照をデコードした平文を返す（プレビュー・AIへの入力用） */
export function htmlToText(html: string | null | undefined): string {
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
