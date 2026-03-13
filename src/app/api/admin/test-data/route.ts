import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'

// --- テストデータ生成用定数 ---
const LAST_NAMES = [
  { kanji: '佐藤', kana: 'さとう' }, { kanji: '鈴木', kana: 'すずき' },
  { kanji: '高橋', kana: 'たかはし' }, { kanji: '田中', kana: 'たなか' },
  { kanji: '伊藤', kana: 'いとう' }, { kanji: '渡辺', kana: 'わたなべ' },
  { kanji: '山本', kana: 'やまもと' }, { kanji: '中村', kana: 'なかむら' },
  { kanji: '小林', kana: 'こばやし' }, { kanji: '加藤', kana: 'かとう' },
  { kanji: '吉田', kana: 'よしだ' }, { kanji: '山田', kana: 'やまだ' },
  { kanji: '松本', kana: 'まつもと' }, { kanji: '井上', kana: 'いのうえ' },
  { kanji: '木村', kana: 'きむら' }, { kanji: '林', kana: 'はやし' },
  { kanji: '清水', kana: 'しみず' }, { kanji: '山口', kana: 'やまぐち' },
  { kanji: '斎藤', kana: 'さいとう' }, { kanji: '池田', kana: 'いけだ' },
]
const FIRST_NAMES = [
  { kanji: '太郎', kana: 'たろう' }, { kanji: '花子', kana: 'はなこ' },
  { kanji: '一郎', kana: 'いちろう' }, { kanji: '美咲', kana: 'みさき' },
  { kanji: '健太', kana: 'けんた' }, { kanji: '陽子', kana: 'ようこ' },
  { kanji: '翔太', kana: 'しょうた' }, { kanji: '由美', kana: 'ゆみ' },
  { kanji: '大輔', kana: 'だいすけ' }, { kanji: '真理', kana: 'まり' },
]
const ADDRESSES = [
  '東京都新宿区西新宿2-8-1', '東京都渋谷区神南1-9-11', '東京都港区六本木6-10-1',
  '東京都千代田区丸の内1-9-2', '東京都中央区銀座4-6-16', '東京都品川区東品川2-3-14',
  '東京都豊島区東池袋1-18-1', '東京都世田谷区玉川3-17-1', '東京都文京区後楽1-3-61',
  '東京都台東区浅草2-3-1', '大阪府大阪市北区梅田3-1-3', '大阪府大阪市中央区難波5-1-18',
  '大阪府大阪市天王寺区悲田院町10-39', '大阪府大阪市淀川区西中島5-16-1',
  '愛知県名古屋市中村区名駅1-1-4', '愛知県名古屋市中区栄3-6-1',
  '福岡県福岡市博多区博多駅中央街1-1', '福岡県福岡市中央区天神2-5-55',
  '北海道札幌市中央区北5条西2-5', '北海道札幌市中央区大通西4-1',
]
const VISIT_NOTES = [
  'ブランドバッグ2点', '時計1点・アクセサリー3点', '着物一式', '貴金属5点',
  'ブランド財布・キーケース', 'ダイヤモンドリング1点', '骨董品3点',
  '電化製品まとめて', 'カメラ・レンズセット', '楽器（ギター）1点',
  '古銭コレクション', 'フィギュア10点', '高級食器セット', 'ゴルフクラブセット',
  '毛皮コート2着', 'ブランド靴3足', '絵画1点', 'シルバーアクセサリーまとめ',
  '切手コレクション', 'ワインセット',
]
const STATUS_WEIGHTS = [
  { status: 'completed', weight: 50 }, { status: 'scheduled', weight: 15 },
  { status: 'pending', weight: 10 }, { status: 'rescheduled', weight: 10 },
  { status: 'absent', weight: 10 }, { status: 'cancelled', weight: 5 },
]
function seededRandom(seed: number) {
  return Math.floor(Math.abs(Math.sin(seed + 1) * 10000))
}
function pickStatus(seed: number) {
  const total = STATUS_WEIGHTS.reduce((s, w) => s + w.weight, 0)
  let r = seededRandom(seed) % total
  for (const w of STATUS_WEIGHTS) {
    r -= w.weight
    if (r < 0) return w.status
  }
  return STATUS_WEIGHTS[0].status
}

// テストデータ件数を返す
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const userCount = await prisma.user.count({ where: { isTestData: true } })

  const testUsers = await prisma.user.findMany({
    where: { isTestData: true },
    select: { id: true },
  })
  const userIds = testUsers.map(u => u.id)

  const visitCount = userIds.length > 0
    ? await prisma.visitSchedule.count({ where: { userId: { in: userIds } } })
    : 0

  const licenseKeyCount = await prisma.licenseKey.count({
    where: { key: { startsWith: 'KK-TEST-' } },
  })

  return NextResponse.json({ userCount, visitCount, licenseKeyCount })
}

// テストデータ一括削除
export async function DELETE() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const testUsers = await prisma.user.findMany({
    where: { isTestData: true },
    select: { id: true, licenseKeyId: true },
  })

  if (testUsers.length === 0) {
    return NextResponse.json({ deletedVisits: 0, deletedUsers: 0, deletedLicenseKeys: 0 })
  }

  const userIds = testUsers.map(u => u.id)
  const licenseKeyIds = testUsers.map(u => u.licenseKeyId)

  // FK制約に従い順番に削除（トランザクション）
  const [deletedVisits, deletedUsers, deletedLicenseKeys] = await prisma.$transaction([
    prisma.visitSchedule.deleteMany({ where: { userId: { in: userIds } } }),
    prisma.user.deleteMany({ where: { isTestData: true } }),
    prisma.licenseKey.deleteMany({ where: { id: { in: licenseKeyIds } } }),
  ])

  return NextResponse.json({
    deletedVisits: deletedVisits.count,
    deletedUsers: deletedUsers.count,
    deletedLicenseKeys: deletedLicenseKeys.count,
  })
}

// テストデータ投入（100顧客 + 各10訪問 = 1000件）
export async function POST() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as any
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 既存テストデータチェック
  const existingCount = await prisma.user.count({ where: { isTestData: true } })
  if (existingCount > 0) {
    return NextResponse.json(
      { error: `テストデータが既に ${existingCount} 件あります。先に削除してください。` },
      { status: 409 }
    )
  }

  const stores = await prisma.store.findMany({ orderBy: { code: 'asc' } })
  if (stores.length === 0) {
    return NextResponse.json({ error: '店舗が登録されていません。' }, { status: 400 })
  }

  const password = await bcrypt.hash('test1234', 10)
  const now = new Date()

  // 1. ライセンスキー100件
  let createdKeys = 0
  for (let i = 1; i <= 100; i++) {
    const key = `KK-TEST-${String(i).padStart(4, '0')}-0000`
    const existing = await prisma.licenseKey.findUnique({ where: { key } })
    if (!existing) {
      await prisma.licenseKey.create({ data: { key, isUsed: true } })
      createdKeys++
    }
  }

  // 2. 顧客100名
  const createdUsers: { id: string; storeIdx: number }[] = []
  for (let i = 1; i <= 100; i++) {
    const num = String(i).padStart(3, '0')
    const lastName = LAST_NAMES[(i - 1) % LAST_NAMES.length]
    const firstName = FIRST_NAMES[(i - 1) % FIRST_NAMES.length]
    const store = stores[(i - 1) % stores.length]
    const licenseKey = await prisma.licenseKey.findUnique({
      where: { key: `KK-TEST-${String(i).padStart(4, '0')}-0000` },
    })
    if (!licenseKey) continue

    const u = await prisma.user.create({
      data: {
        name: `${lastName.kanji} ${firstName.kanji}`,
        furigana: `${lastName.kana} ${firstName.kana}`,
        email: `test-user-${num}@kaikuru-test.jp`,
        phone: `090-${String(1000 + i).slice(-4)}-${String(2000 + i * 3).slice(-4)}`,
        address: ADDRESSES[(i - 1) % ADDRESSES.length],
        password,
        licenseKeyId: licenseKey.id,
        storeId: store.id,
        isTestData: true,
      },
    })
    createdUsers.push({ id: u.id, storeIdx: (i - 1) % stores.length })
  }

  // 3. 訪問記録 各10件 = 1000件
  let totalVisits = 0
  for (let u = 0; u < createdUsers.length; u++) {
    const cu = createdUsers[u]
    const store = stores[cu.storeIdx]
    for (let v = 0; v < 10; v++) {
      const visitDate = new Date(now)
      visitDate.setMonth(visitDate.getMonth() - (v + 1))
      visitDate.setDate(1 + seededRandom(u * 10 + v) % 28)
      visitDate.setHours(9 + (v % 8), 0, 0, 0)
      const status = pickStatus(u * 10 + v)
      const isCompleted = status === 'completed'
      await prisma.visitSchedule.create({
        data: {
          userId: cu.id,
          storeId: store.id,
          visitDate,
          status,
          note: isCompleted ? VISIT_NOTES[seededRandom(u * 10 + v + 500) % VISIT_NOTES.length] : null,
          purchaseAmount: isCompleted ? 5000 + seededRandom(u * 100 + v) % 495001 : null,
          billingAmount: isCompleted ? 3000 + seededRandom(u * 100 + v + 50) % 97001 : null,
        },
      })
      totalVisits++
    }
  }

  return NextResponse.json({
    createdUsers: createdUsers.length,
    createdVisits: totalVisits,
    createdLicenseKeys: createdKeys,
  })
}
