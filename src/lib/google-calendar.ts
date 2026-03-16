import { google } from 'googleapis'
import { prisma } from './prisma'
import { encrypt, decrypt } from './encrypt'

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? ''

/**
 * 店舗のGoogleカレンダー連携用 OAuth2 クライアントを取得
 * トークンが期限切れの場合は自動リフレッシュしてDBを更新する
 */
export async function getOAuth2Client(storeId: string) {
  const config = await prisma.storeGoogleCalendar.findUnique({
    where: { storeId },
  })

  if (!config || !config.isEnabled || !config.accessToken || !config.refreshToken) {
    return null
  }

  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET
  )

  const accessToken = decrypt(config.accessToken)
  const refreshToken = decrypt(config.refreshToken)

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
    expiry_date: config.tokenExpiry?.getTime(),
  })

  // トークンが期限切れ or 5分以内に期限切れの場合はリフレッシュ
  const now = Date.now()
  const expiryTime = config.tokenExpiry?.getTime() ?? 0
  if (expiryTime - now < 5 * 60 * 1000) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken()
      oauth2Client.setCredentials(credentials)

      // リフレッシュ後のトークンをDBに暗号化して保存
      await prisma.storeGoogleCalendar.update({
        where: { storeId },
        data: {
          accessToken: encrypt(credentials.access_token ?? ''),
          refreshToken: credentials.refresh_token
            ? encrypt(credentials.refresh_token)
            : undefined, // refresh_token が返らない場合は既存を維持
          tokenExpiry: credentials.expiry_date
            ? new Date(credentials.expiry_date)
            : undefined,
        },
      })
    } catch (error) {
      console.error(`[GoogleCalendar] トークンリフレッシュ失敗 (storeId: ${storeId}):`, error)
      return null
    }
  }

  return oauth2Client
}

/**
 * Googleカレンダーに訪問スケジュールのイベントを作成
 * カレンダー未連携の場合は null を返す（エラーをスローしない）
 */
export async function createCalendarEvent(
  storeId: string,
  visitSchedule: {
    visitDate: Date
    note?: string | null
    user: {
      name: string
      address: string
    }
  }
): Promise<string | null> {
  try {
    const oauth2Client = await getOAuth2Client(storeId)
    if (!oauth2Client) return null

    const config = await prisma.storeGoogleCalendar.findUnique({
      where: { storeId },
    })
    const calendarId = config?.calendarId ?? 'primary'

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    const startTime = new Date(visitSchedule.visitDate)
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000) // 1時間

    const descriptionParts: string[] = []
    if (visitSchedule.note) {
      descriptionParts.push(visitSchedule.note)
    }
    if (visitSchedule.user.address) {
      descriptionParts.push(`住所: ${visitSchedule.user.address}`)
    }

    const event = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: `【買いクル】${visitSchedule.user.name}様 出張買取`,
        description: descriptionParts.join('\n') || undefined,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'Asia/Tokyo',
        },
        location: visitSchedule.user.address || undefined,
      },
    })

    return event.data.id ?? null
  } catch (error) {
    console.error(`[GoogleCalendar] イベント作成失敗 (storeId: ${storeId}):`, error)
    return null
  }
}

/**
 * 既存のGoogleカレンダーイベントを更新
 * カレンダー未連携 or eventId が null の場合は何もしない
 */
export async function updateCalendarEvent(
  storeId: string,
  eventId: string | null | undefined,
  visitSchedule: {
    visitDate: Date
    note?: string | null
    user: {
      name: string
      address: string
    }
  }
): Promise<void> {
  if (!eventId) return

  try {
    const oauth2Client = await getOAuth2Client(storeId)
    if (!oauth2Client) return

    const config = await prisma.storeGoogleCalendar.findUnique({
      where: { storeId },
    })
    const calendarId = config?.calendarId ?? 'primary'

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    const startTime = new Date(visitSchedule.visitDate)
    const endTime = new Date(startTime.getTime() + 60 * 60 * 1000)

    const descriptionParts: string[] = []
    if (visitSchedule.note) {
      descriptionParts.push(visitSchedule.note)
    }
    if (visitSchedule.user.address) {
      descriptionParts.push(`住所: ${visitSchedule.user.address}`)
    }

    await calendar.events.update({
      calendarId,
      eventId,
      requestBody: {
        summary: `【買いクル】${visitSchedule.user.name}様 出張買取`,
        description: descriptionParts.join('\n') || undefined,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'Asia/Tokyo',
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'Asia/Tokyo',
        },
        location: visitSchedule.user.address || undefined,
      },
    })
  } catch (error) {
    console.error(`[GoogleCalendar] イベント更新失敗 (storeId: ${storeId}, eventId: ${eventId}):`, error)
  }
}

/**
 * Googleカレンダーイベントを削除
 * カレンダー未連携 or eventId が null の場合は何もしない
 */
export async function deleteCalendarEvent(
  storeId: string,
  eventId: string | null | undefined
): Promise<void> {
  if (!eventId) return

  try {
    const oauth2Client = await getOAuth2Client(storeId)
    if (!oauth2Client) return

    const config = await prisma.storeGoogleCalendar.findUnique({
      where: { storeId },
    })
    const calendarId = config?.calendarId ?? 'primary'

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    await calendar.events.delete({
      calendarId,
      eventId,
    })
  } catch (error) {
    console.error(`[GoogleCalendar] イベント削除失敗 (storeId: ${storeId}, eventId: ${eventId}):`, error)
  }
}

/**
 * 連携済みGoogleアカウントのカレンダー一覧を取得
 * カレンダー選択UIで使用
 */
export async function listCalendars(
  storeId: string
): Promise<{ id: string; name: string; primary: boolean }[] | null> {
  try {
    const oauth2Client = await getOAuth2Client(storeId)
    if (!oauth2Client) return null

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client })

    const res = await calendar.calendarList.list()
    const items = res.data.items ?? []

    return items.map((item) => ({
      id: item.id ?? '',
      name: item.summary ?? '',
      primary: item.primary ?? false,
    }))
  } catch (error) {
    console.error(`[GoogleCalendar] カレンダー一覧取得失敗 (storeId: ${storeId}):`, error)
    return null
  }
}
