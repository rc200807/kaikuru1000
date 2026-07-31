import { NextRequest, NextResponse, after } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { deleteFile } from '@/lib/storage'
import { z } from 'zod'
import { autoSyncOperatorRowsDeleted, autoSyncStoreRows } from '@/lib/sheet-sync'

const schema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(500),
})

/** 運営者の一括削除（紐付け店舗の operatorId は SetNull され削除されない） */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !['admin', 'superadmin', 'hr'].includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'バリデーションエラー' }, { status: 400 })
  }

  const { ids } = parsed.data

  // 契約書ファイルを先に取得し、後で消す
  const operators = await prisma.operator.findMany({
    where: { id: { in: ids } },
    select: { id: true, contractFilePath: true },
  })

  // 削除で operatorId が SetNull される店舗は「運営者名」列が変わるため、削除前に控える
  const affectedStores = await prisma.store.findMany({
    where: { operatorId: { in: ids } },
    select: { code: true },
  })

  const result = await prisma.operator.deleteMany({ where: { id: { in: ids } } })

  // 契約書ファイルの削除はベストエフォート
  await Promise.all(operators.map(async (o) => {
    if (o.contractFilePath) {
      try { await deleteFile(o.contractFilePath) } catch { /* ignore */ }
    }
  }))

  after(async () => {
    await autoSyncOperatorRowsDeleted(ids)
    await autoSyncStoreRows(affectedStores.map(s => s.code))
  })

  return NextResponse.json({ deleted: result.count })
}
