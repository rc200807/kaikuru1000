// アクセス計測のクライアント/サーバー共用型

export type TrackingSiteItem = {
  id: string
  siteKey: string
  name: string
  domains: string[]
  isActive: boolean
  buttonCount: number
  createdAt: string
}

export type TrackingButtonItem = {
  id: string
  siteId: string
  siteName: string
  buttonKey: string
  name: string
  kind: string
  isConversion: boolean
  clickCount: number
  createdAt: string
}

export type TrackingCampaignItem = {
  id: string
  name: string
  baseUrl: string
  params: Record<string, string>
  builtUrl: string
  sessions: number
  conversions: number
  cvr: number
  createdAt: string
}

/** 経路探索フロー図のデータ */
export type PathFlowNode = {
  key: string        // path（"他"は "__other__"）
  label: string      // 表示名（title優先）
  count: number
  isOther?: boolean
}
export type PathFlowLink = {
  fromStep: number   // 遷移元ステップindex（-1 = 始点）
  fromKey: string
  toKey: string
  count: number
}
export type PathFlowResult = {
  totalSessions: number
  truncated: boolean
  steps: { index: number; nodes: PathFlowNode[] }[]
  links: PathFlowLink[]
}

export type TrackingVisitorRow = {
  id: string
  visitorKey: string
  firstSeenAt: string
  lastSeenAt: string
  firstReferrer: string | null
  channel: string | null
  deviceType: string | null
  region: string | null
  sessionCount: number
  conversionCount: number
  customerName: string | null
  userId: string | null
}

export type VisitorTimelineItem = {
  kind: 'pageview' | 'button_click' | 'inquiry_submit' | 'form_submit'
  occurredAt: string
  title: string | null
  url: string | null
  durationSec: number | null
  scrollDepth: number | null
  buttonName?: string | null
  storeName?: string | null
}

export type VisitorDetail = {
  id: string
  visitorKey: string
  firstSeenAt: string
  lastSeenAt: string
  firstUrl: string | null
  firstReferrer: string | null
  customer: { id: string; name: string } | null
  attribution: {
    firstChannel: string | null
    firstReferrer: string | null
    firstParams: Record<string, string>
    sessionsToConversion: number | null
    daysToConversion: number | null
  }
  sessions: {
    id: string
    startedAt: string
    entryUrl: string
    entryTitle: string | null
    referrer: string | null
    entryParams: Record<string, string>
    channel: string | null
    deviceType: string | null
    browser: string | null
    os: string | null
    screenSize: string | null
    language: string | null
    ipAddress: string | null
    country: string | null
    region: string | null
    city: string | null
    userAgent: string | null
    hasConversion: boolean
    timeline: VisitorTimelineItem[]
  }[]
}

export type ParamStatRow = {
  key: string
  value: string
  sessions: number
  cvSessions: number     // ラストタッチ（そのパラメータで流入したセッションがCV）
  cvr: number
  firstTouchCv: number   // ファーストタッチ（CV訪問者の初回流入がこのパラメータ）
  topLanding: string | null
}

export type PageStatRow = {
  path: string
  title: string | null
  pv: number
  avgDuration: number | null
  avgScroll: number | null
  exitRate: number
  sessions: number
  cvContribution: number  // このページを経由したセッションのCVR
}

export type DealResultsData = {
  funnel: { name: string; count: number }[]
  channelResults: { channel: string; sessions: number; inquiries: number; deals: number; won: number; amount: number }[]
  landingResults: { path: string; inquiries: number; deals: number; won: number; amount: number }[]
  storeResults: { storeId: string; store: string; conversions: number; deals: number; won: number; amount: number; topChannel: string | null }[]
  campaignResults: { name: string; sessions: number; conversions: number; deals: number; won: number; amount: number }[]
  leadTimes: { channel: string; avgDaysToInquiry: number | null; avgDaysToWon: number | null; count: number }[]
  totalAmount: number
}

export type RealtimeData = {
  activeVisitors: number
  activePages: { path: string; title: string | null; count: number }[]
  recentConversions: {
    visitorId: string
    type: string
    occurredAt: string
    storeName: string | null
    buttonName: string | null
    channel: string | null
    referrer: string | null
  }[]
}
