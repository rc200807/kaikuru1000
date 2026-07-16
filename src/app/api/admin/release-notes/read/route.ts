import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const ADMIN_ROLES = ['admin', 'superadmin', 'hr']

/** 公開済みリリースノートをすべて既読にする（ダッシュボード閲覧時に呼ぶ） */
export async function POST() {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!session || !ADMIN_ROLES.includes(user?.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminId = user.id

  const notes = await prisma.releaseNote.findMany({
    where: { isPublished: true, targetAdmin: true },
    select: { id: true },
  })
  if (notes.length === 0) return NextResponse.json({ ok: true, marked: 0 })

  const already = await prisma.releaseNoteRead.findMany({
    where: { readerType: 'admin', readerId: adminId, releaseNoteId: { in: notes.map(n => n.id) } },
    select: { releaseNoteId: true },
  })
  const alreadySet = new Set(already.map(r => r.releaseNoteId))
  const toCreate = notes.filter(n => !alreadySet.has(n.id))

  if (toCreate.length > 0) {
    await prisma.releaseNoteRead.createMany({
      data: toCreate.map(n => ({ releaseNoteId: n.id, readerType: 'admin', readerId: adminId })),
    })
  }

  return NextResponse.json({ ok: true, marked: toCreate.length })
}
