// 外部サイト向けアクセス計測の共通ロジック（サーバー専用）。
// UA/チャネル/地域の軽量判定と、問い合わせCVの紐付け（linkConversion）を提供する。
import { prisma } from '@/lib/prisma'

/* ─── キー発行 ─── */

const KEY_CHARS = 'abcdefghijkmnpqrstuvwxyz23456789' // 紛らわしい文字を除外

export function generateTrackingKey(length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) out += KEY_CHARS[Math.floor(Math.random() * KEY_CHARS.length)]
  return out
}

/* ─── User-Agent 軽量判定 ─── */

export function parseUserAgent(ua: string | null): { deviceType: string; browser: string; os: string } {
  const s = ua ?? ''
  const deviceType = /iPad|Android(?!.*Mobile)|Tablet/i.test(s)
    ? 'tablet'
    : /Mobile|iPhone|Android/i.test(s)
      ? 'mobile'
      : 'desktop'
  const os = /iPhone|iPad|iPod/i.test(s) ? 'iOS'
    : /Android/i.test(s) ? 'Android'
    : /Windows/i.test(s) ? 'Windows'
    : /Mac OS X|Macintosh/i.test(s) ? 'macOS'
    : /Linux/i.test(s) ? 'Linux'
    : '不明'
  const browser = /Edg\//i.test(s) ? 'Edge'
    : /OPR\/|Opera/i.test(s) ? 'Opera'
    : /SamsungBrowser/i.test(s) ? 'Samsung Internet'
    : /Line\//i.test(s) ? 'LINE'
    : /FBAN|FBAV|Instagram/i.test(s) ? 'アプリ内ブラウザ'
    : /Firefox\//i.test(s) ? 'Firefox'
    : /Chrome\/|CriOS/i.test(s) ? 'Chrome'
    : /Safari\//i.test(s) ? 'Safari'
    : '不明'
  return { deviceType, browser, os }
}

/** 既知botのUA（サーバー側の破棄用） */
export function isBotUserAgent(ua: string | null): boolean {
  if (!ua) return false
  return /bot|crawler|spider|crawling|headless|lighthouse|pagespeed|pingdom|facebookexternalhit|slurp/i.test(ua)
}

/* ─── チャネル自動分類 ─── */

const SEARCH_DOMAINS = /google\.|bing\.com|yahoo\.|duckduckgo\.com|baidu\.com|ecosia\.org|search\.brave/i
const SOCIAL_DOMAINS = /facebook\.com|instagram\.com|twitter\.com|x\.com|t\.co|linkedin\.com|pinterest\.|tiktok\.com|youtube\.com|line\.me|lin\.ee|threads\.net|note\.com/i

export { CHANNEL_LABEL } from '@/lib/tracking-labels'

/** referrer + ランディングパラメータからチャネルを分類 */
export function classifyChannel(referrer: string | null, entryParams: Record<string, string>): string {
  // 広告パラメータが最優先（クリックID or utm_medium=cpc等）
  if (entryParams.gclid || entryParams.yclid || entryParams.fbclid || entryParams.msclkid || entryParams.ttclid) return 'ad'
  const medium = (entryParams.utm_medium ?? '').toLowerCase()
  if (/cpc|ppc|paid|display|banner|ad/.test(medium)) return 'ad'
  if (/social|sns/.test(medium)) return 'social'
  if (/email|mail/.test(medium)) return 'referral'
  if (entryParams.utm_source && !referrer) {
    // referrerなしでもutm_sourceがあれば分類を試みる
    const src = entryParams.utm_source.toLowerCase()
    if (/instagram|facebook|twitter|x|line|tiktok|youtube/.test(src)) return 'social'
    if (/google|yahoo|bing/.test(src)) return 'search'
  }
  if (!referrer) return 'direct'
  try {
    const host = new URL(referrer).hostname
    if (SEARCH_DOMAINS.test(host)) return 'search'
    if (SOCIAL_DOMAINS.test(host)) return 'social'
    return 'referral'
  } catch {
    return 'direct'
  }
}

/* ─── 地域（Vercelジオヘッダー） ─── */

/** JIS X 0401 都道府県コード → 県名（x-vercel-ip-country-region は JP の場合 "13" 等） */
const JP_REGIONS: Record<string, string> = {
  '01': '北海道', '02': '青森県', '03': '岩手県', '04': '宮城県', '05': '秋田県', '06': '山形県', '07': '福島県',
  '08': '茨城県', '09': '栃木県', '10': '群馬県', '11': '埼玉県', '12': '千葉県', '13': '東京都', '14': '神奈川県',
  '15': '新潟県', '16': '富山県', '17': '石川県', '18': '福井県', '19': '山梨県', '20': '長野県', '21': '岐阜県',
  '22': '静岡県', '23': '愛知県', '24': '三重県', '25': '滋賀県', '26': '京都府', '27': '大阪府', '28': '兵庫県',
  '29': '奈良県', '30': '和歌山県', '31': '鳥取県', '32': '島根県', '33': '岡山県', '34': '広島県', '35': '山口県',
  '36': '徳島県', '37': '香川県', '38': '愛媛県', '39': '高知県', '40': '福岡県', '41': '佐賀県', '42': '長崎県',
  '43': '熊本県', '44': '大分県', '45': '宮崎県', '46': '鹿児島県', '47': '沖縄県',
}

export function resolveGeo(headers: Headers): { country: string | null; region: string | null; city: string | null } {
  const country = headers.get('x-vercel-ip-country')
  const regionRaw = headers.get('x-vercel-ip-country-region')
  const cityRaw = headers.get('x-vercel-ip-city')
  const region = regionRaw
    ? (country === 'JP' ? (JP_REGIONS[regionRaw.padStart(2, '0')] ?? regionRaw) : regionRaw)
    : null
  let city: string | null = null
  if (cityRaw) {
    try { city = decodeURIComponent(cityRaw) } catch { city = cityRaw }
  }
  return { country, region, city }
}

/* ─── CV紐付け（問い合わせ/フォーム送信API から呼ぶ。失敗は握り潰し） ─── */

export async function linkConversion(args: {
  visitorKey: string | null | undefined
  type: 'inquiry_submit' | 'form_submit'
  inquiryId?: string
  formSubmissionId?: string
  storeId?: string | null
  userId?: string | null
  url?: string | null
}): Promise<void> {
  try {
    const visitorKey = (args.visitorKey ?? '').trim()
    if (!visitorKey || visitorKey.length > 64) return
    const visitor = await prisma.trackingVisitor.findUnique({ where: { visitorKey } })
    if (!visitor) return

    // 直近のアクティブセッション（2時間以内）に紐付ける
    const session = await prisma.trackingSession.findFirst({
      where: { visitorId: visitor.id, lastActivityAt: { gte: new Date(Date.now() - 2 * 60 * 60 * 1000) } },
      orderBy: { lastActivityAt: 'desc' },
    })

    await prisma.trackingEvent.create({
      data: {
        visitorId: visitor.id,
        sessionId: session?.id ?? null,
        type: args.type,
        inquiryId: args.inquiryId ?? null,
        formSubmissionId: args.formSubmissionId ?? null,
        storeId: args.storeId ?? null,
        url: args.url ?? null,
        isConversion: true,
      },
    })

    const visitorUpdate: Record<string, unknown> = { lastSeenAt: new Date() }
    if (args.userId && !visitor.userId) visitorUpdate.userId = args.userId
    await prisma.trackingVisitor.update({ where: { id: visitor.id }, data: visitorUpdate })

    if (session && !session.hasConversion) {
      await prisma.trackingSession.update({ where: { id: session.id }, data: { hasConversion: true } })
    }
  } catch (err) {
    console.error('[tracking] linkConversion failed (ignored):', err)
  }
}
