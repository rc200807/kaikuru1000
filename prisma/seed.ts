import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // 管理者アカウント
  const adminPassword = await bcrypt.hash('admin1234', 10)
  await prisma.admin.upsert({
    where: { email: 'admin@kaikuru.jp' },
    update: {},
    create: {
      name: '買いクル本部管理者',
      email: 'admin@kaikuru.jp',
      password: adminPassword,
      role: 'superadmin',
    },
  })
  console.log('✓ Admin created: admin@kaikuru.jp / admin1234')

  // サンプル店舗
  const storePassword = await bcrypt.hash('store1234', 10)
  const stores = [
    { code: 'S001', name: '買いクル東京店', prefecture: '東京都', address: '東京都新宿区西新宿1-1-1', phone: '03-1234-5678', email: 'tokyo@kaikuru.jp' },
    { code: 'S002', name: '買いクル大阪店', prefecture: '大阪府', address: '大阪府大阪市北区梅田1-1-1', phone: '06-1234-5678', email: 'osaka@kaikuru.jp' },
    { code: 'S003', name: '買いクル名古屋店', prefecture: '愛知県', address: '愛知県名古屋市中村区名駅1-1-1', phone: '052-1234-5678', email: 'nagoya@kaikuru.jp' },
    { code: 'S004', name: '買いクル福岡店', prefecture: '福岡県', address: '福岡県福岡市博多区博多駅前1-1-1', phone: '092-1234-5678', email: 'fukuoka@kaikuru.jp' },
    { code: 'S005', name: '買いクル札幌店', prefecture: '北海道', address: '北海道札幌市中央区大通西1-1-1', phone: '011-1234-5678', email: 'sapporo@kaikuru.jp' },
  ]

  for (const store of stores) {
    await prisma.store.upsert({
      where: { code: store.code },
      update: {},
      create: {
        ...store,
        password: storePassword,
      },
    })
  }
  console.log('✓ 5 stores created (password: store1234)')

  // ライセンスキー（20件）
  const licenseKeys = [
    'KK-2024-AAAA-1111',
    'KK-2024-BBBB-2222',
    'KK-2024-CCCC-3333',
    'KK-2024-DDDD-4444',
    'KK-2024-EEEE-5555',
    'KK-2024-FFFF-6666',
    'KK-2024-GGGG-7777',
    'KK-2024-HHHH-8888',
    'KK-2024-IIII-9999',
    'KK-2024-JJJJ-0000',
    'KK-2025-AAAA-1111',
    'KK-2025-BBBB-2222',
    'KK-2025-CCCC-3333',
    'KK-2025-DDDD-4444',
    'KK-2025-EEEE-5555',
    'KK-2025-FFFF-6666',
    'KK-2025-GGGG-7777',
    'KK-2025-HHHH-8888',
    'KK-2025-IIII-9999',
    'KK-2025-JJJJ-0000',
  ]

  for (const key of licenseKeys) {
    await prisma.licenseKey.upsert({
      where: { key },
      update: {},
      create: { key },
    })
  }
  console.log('✓ 20 license keys created')

  // サンプル顧客（2件）
  const userPassword = await bcrypt.hash('user1234', 10)
  const tokyoStore = await prisma.store.findUnique({ where: { code: 'S001' } })
  const osakaStore = await prisma.store.findUnique({ where: { code: 'S002' } })

  const licenseKey1 = await prisma.licenseKey.findUnique({ where: { key: 'KK-2024-AAAA-1111' } })
  const licenseKey2 = await prisma.licenseKey.findUnique({ where: { key: 'KK-2024-BBBB-2222' } })

  if (licenseKey1 && !licenseKey1.isUsed) {
    const user1 = await prisma.user.upsert({
      where: { email: 'yamada@example.com' },
      update: {},
      create: {
        name: '山田太郎',
        furigana: 'やまだたろう',
        email: 'yamada@example.com',
        phone: '090-1234-5678',
        address: '東京都渋谷区渋谷1-1-1',
        password: userPassword,
        licenseKeyId: licenseKey1.id,
        storeId: tokyoStore?.id,
      },
    })
    await prisma.licenseKey.update({
      where: { id: licenseKey1.id },
      data: { isUsed: true },
    })

    // 訪問スケジュール
    if (tokyoStore) {
      await prisma.visitSchedule.create({
        data: {
          userId: user1.id,
          storeId: tokyoStore.id,
          visitDate: new Date('2026-03-25'),
          status: 'scheduled',
          note: '初回訪問',
        },
      })
    }
    console.log('✓ Sample user 1: yamada@example.com / user1234')
  }

  if (licenseKey2 && !licenseKey2.isUsed) {
    await prisma.user.upsert({
      where: { email: 'tanaka@example.com' },
      update: {},
      create: {
        name: '田中花子',
        furigana: 'たなかはなこ',
        email: 'tanaka@example.com',
        phone: '080-9876-5432',
        address: '大阪府大阪市北区天満1-2-3',
        password: userPassword,
        licenseKeyId: licenseKey2.id,
        storeId: osakaStore?.id,
      },
    })
    await prisma.licenseKey.update({
      where: { id: licenseKey2.id },
      data: { isUsed: true },
    })
    console.log('✓ Sample user 2: tanaka@example.com / user1234')
  }

  console.log('\nSeeding complete!')
  console.log('\n=== ログイン情報 ===')
  console.log('管理者: admin@kaikuru.jp / admin1234')
  console.log('店舗:   tokyo@kaikuru.jp / store1234')
  console.log('顧客:   yamada@example.com / user1234')
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
