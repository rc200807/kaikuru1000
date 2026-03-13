const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

// --- 日本の名前データ ---
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

// 決定的擬似乱数
function seededRandom(seed) {
  const x = Math.sin(seed + 1) * 10000
  return Math.floor(Math.abs(x))
}

// ステータス重み付き選択
const STATUS_WEIGHTS = [
  { status: 'completed', weight: 50 },
  { status: 'scheduled', weight: 15 },
  { status: 'pending', weight: 10 },
  { status: 'rescheduled', weight: 10 },
  { status: 'absent', weight: 10 },
  { status: 'cancelled', weight: 5 },
]

function pickStatus(seed) {
  const total = STATUS_WEIGHTS.reduce((s, w) => s + w.weight, 0)
  let r = seededRandom(seed) % total
  for (const w of STATUS_WEIGHTS) {
    r -= w.weight
    if (r < 0) return w.status
  }
  return STATUS_WEIGHTS[0].status
}

async function main() {
  console.log('=== テストデータ投入開始 ===')
  console.log('100顧客 + 各10訪問記録 = 計1000訪問\n')

  const password = await bcrypt.hash('test1234', 10)

  // 既存の店舗を取得
  const stores = await prisma.store.findMany({ orderBy: { code: 'asc' } })
  if (stores.length === 0) {
    throw new Error('店舗が見つかりません。先に prisma/seed.js を実行してください。')
  }
  console.log(`✓ ${stores.length}店舗を検出: ${stores.map(s => s.name).join(', ')}`)

  // 既存テストデータのチェック
  const existingTestUsers = await prisma.user.count({ where: { isTestData: true } })
  if (existingTestUsers > 0) {
    console.log(`\n⚠ 既存テストユーザーが ${existingTestUsers} 件あります。スキップします。`)
    console.log('再投入するには、先に管理ポータルの設定画面からテストデータを削除してください。')
    return
  }

  // 1. ライセンスキー100件を作成
  console.log('\n--- ライセンスキー作成中... ---')
  const licenseKeyData = []
  for (let i = 1; i <= 100; i++) {
    licenseKeyData.push({
      key: `KK-TEST-${String(i).padStart(4, '0')}-0000`,
      isUsed: true,
    })
  }

  // バッチ処理: 既存キーをスキップ
  let createdKeys = 0
  for (const lkData of licenseKeyData) {
    const existing = await prisma.licenseKey.findUnique({ where: { key: lkData.key } })
    if (!existing) {
      await prisma.licenseKey.create({ data: lkData })
      createdKeys++
    }
  }
  console.log(`✓ ライセンスキー ${createdKeys} 件作成（既存スキップ ${100 - createdKeys} 件）`)

  // 2. 100顧客を作成
  console.log('\n--- テスト顧客作成中... ---')
  const createdUsers = []
  for (let i = 1; i <= 100; i++) {
    const num = String(i).padStart(3, '0')
    const email = `test-user-${num}@kaikuru-test.jp`
    const lastName = LAST_NAMES[(i - 1) % LAST_NAMES.length]
    const firstName = FIRST_NAMES[(i - 1) % FIRST_NAMES.length]
    const store = stores[(i - 1) % stores.length]
    const licenseKey = await prisma.licenseKey.findUnique({
      where: { key: `KK-TEST-${String(i).padStart(4, '0')}-0000` },
    })

    if (!licenseKey) continue

    const user = await prisma.user.create({
      data: {
        name: `${lastName.kanji} ${firstName.kanji}`,
        furigana: `${lastName.kana} ${firstName.kana}`,
        email,
        phone: `090-${String(1000 + i).slice(-4)}-${String(2000 + i * 3).slice(-4)}`,
        address: ADDRESSES[(i - 1) % ADDRESSES.length],
        password,
        licenseKeyId: licenseKey.id,
        storeId: store.id,
        isTestData: true,
      },
    })
    createdUsers.push(user)

    if (i % 20 === 0) console.log(`  ... ${i}/100 顧客作成完了`)
  }
  console.log(`✓ テスト顧客 ${createdUsers.length} 名作成`)

  // 3. 各ユーザーに10件の訪問記録を作成
  console.log('\n--- 訪問記録作成中... ---')
  let totalVisits = 0
  const now = new Date()

  for (let u = 0; u < createdUsers.length; u++) {
    const user = createdUsers[u]
    const store = stores[(u) % stores.length]
    const visitData = []

    for (let v = 0; v < 10; v++) {
      const monthsAgo = v + 1  // 1〜10ヶ月前
      const visitDate = new Date(now)
      visitDate.setMonth(visitDate.getMonth() - monthsAgo)
      // 日付を1〜28の範囲でランダム設定
      visitDate.setDate(1 + seededRandom(u * 10 + v) % 28)
      visitDate.setHours(9 + (v % 8), 0, 0, 0)

      const status = pickStatus(u * 10 + v)
      const isCompleted = status === 'completed'

      visitData.push({
        userId: user.id,
        storeId: store.id,
        visitDate,
        status,
        note: isCompleted ? VISIT_NOTES[seededRandom(u * 10 + v + 500) % VISIT_NOTES.length] : null,
        purchaseAmount: isCompleted ? 5000 + seededRandom(u * 100 + v) % 495001 : null,
        billingAmount: isCompleted ? 3000 + seededRandom(u * 100 + v + 50) % 97001 : null,
      })
    }

    // バッチ挿入
    for (const vd of visitData) {
      await prisma.visitSchedule.create({ data: vd })
      totalVisits++
    }

    if ((u + 1) % 20 === 0) console.log(`  ... ${u + 1}/100 ユーザーの訪問記録作成完了`)
  }
  console.log(`✓ 訪問記録 ${totalVisits} 件作成`)

  // サマリー
  console.log('\n=== テストデータ投入完了 ===')
  console.log(`顧客:       ${createdUsers.length} 名`)
  console.log(`訪問記録:   ${totalVisits} 件`)
  console.log(`ライセンスキー: ${createdKeys} 件`)
  console.log(`\nテストユーザーのメール: test-user-001@kaikuru-test.jp 〜 test-user-100@kaikuru-test.jp`)
  console.log(`パスワード: test1234`)
  console.log(`\nテストデータは管理ポータルの設定画面から一括削除できます。`)
}

main()
  .catch((e) => {
    console.error('エラー:', e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
