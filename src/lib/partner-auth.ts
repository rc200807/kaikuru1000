import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export type PartnerUser = { id: string; email: string; name: string | null }

export async function requirePartner(): Promise<PartnerUser | null> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user || user.role !== 'partner') return null
  return { id: user.id, email: user.email, name: user.name ?? null }
}
