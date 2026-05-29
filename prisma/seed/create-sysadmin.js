// システム管理者アカウントを作成/更新する一回限りのスクリプト。
// 使い方: node prisma/seed/create-sysadmin.js [email] [password] [name]
// 環境変数 SYSADMIN_EMAIL / SYSADMIN_PASSWORD / SYSADMIN_NAME でも指定可。
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  const email = process.argv[2] || process.env.SYSADMIN_EMAIL || 'sysadmin@kaikuru.jp'
  const password = process.argv[3] || process.env.SYSADMIN_PASSWORD || 'sysadmin1234'
  const name = process.argv[4] || process.env.SYSADMIN_NAME || 'システム管理者'

  const hashed = await bcrypt.hash(password, 10)

  const admin = await prisma.admin.upsert({
    where: { email },
    update: { role: 'sysadmin', name },
    create: { email, password: hashed, role: 'sysadmin', name },
  })

  console.log(`✅ sysadmin ready: ${admin.email} (role=${admin.role})`)
  console.log(`   ※ 既存アカウントの場合パスワードは変更されません。新規作成時のみ「${password}」が設定されます。`)
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
