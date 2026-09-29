import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireSysAdmin } from '@/lib/sysadmin-auth'

export const runtime = 'nodejs'

export async function GET() {
  const user = await requireSysAdmin()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // password 等の機微フィールドは select で明示的に除外する
  const [admins, partners, pendingLoginRequests] = await Promise.all([
    prisma.admin.findMany({
      select: {
        id: true, name: true, email: true, loginId: true, role: true,
        authMethod: true, status: true, approvedAt: true, createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.salesPartner.findMany({
      select: {
        id: true, name: true, email: true, isActive: true, acceptedAt: true, createdAt: true,
        invitedBy: { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    // ID+パスワード方式のログインリクエスト（承認待ち・期限内）
    prisma.adminLoginRequest.count({ where: { status: 'pending', expiresAt: { gt: new Date() } } }),
  ])

  const idpassAdmins = admins.filter(a => a.authMethod === 'idpass').length
  const partnersUnaccepted = partners.filter(p => !p.acceptedAt).length

  return NextResponse.json({
    summary: { pendingLoginRequests, idpassAdmins, partnersUnaccepted },
    admins,
    partners: partners.map(p => ({
      id: p.id,
      name: p.name,
      email: p.email,
      isActive: p.isActive,
      acceptedAt: p.acceptedAt,
      createdAt: p.createdAt,
      invitedByName: p.invitedBy?.name ?? null,
    })),
  })
}
