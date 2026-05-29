import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requireSysAdmin } from '@/lib/sysadmin-auth'
import { recordAccessLog } from '@/lib/access-log'

export const runtime = 'nodejs'

const schema = z.object({ ids: z.array(z.string().min(1)).min(1).max(2000) })

// 備品の表示順を一括更新（配列の並び順 = sortOrder）
export async function PATCH(req: NextRequest) {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: '並び順データが不正です' }, { status: 400 })

  await prisma.$transaction(
    parsed.data.ids.map((id, index) =>
      prisma.product.update({ where: { id }, data: { sortOrder: index } })
    )
  )
  await recordAccessLog({ userType: 'sysadmin', userId: user.id, userName: user.name, action: '備品の表示順を変更', req })
  return NextResponse.json({ ok: true })
}
