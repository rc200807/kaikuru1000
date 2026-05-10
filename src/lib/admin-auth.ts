import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

export type AdminRole = 'admin' | 'superadmin' | 'hr'

export const ADMIN_ROLES: AdminRole[] = ['admin', 'superadmin', 'hr']

export type AdminUser = {
  id: string
  email: string
  name?: string | null
  role: AdminRole
  avatar?: string | null
}

function isAdminRole(value: unknown): value is AdminRole {
  return value === 'admin' || value === 'superadmin' || value === 'hr'
}

export async function getAdminUser(): Promise<AdminUser | null> {
  const session = await getServerSession(authOptions)
  const user = session?.user as any
  if (!user || !isAdminRole(user.role)) return null
  return {
    id: user.id,
    email: user.email,
    name: user.name ?? null,
    role: user.role,
    avatar: user.avatar ?? null,
  }
}

export async function requireAdmin(): Promise<AdminUser | null> {
  return getAdminUser()
}

export async function requireRole(allowed: AdminRole[]): Promise<AdminUser | null> {
  const user = await getAdminUser()
  if (!user) return null
  if (!allowed.includes(user.role)) return null
  return user
}

export function canViewSensitiveEmployee(role: AdminRole): boolean {
  return role === 'superadmin' || role === 'hr'
}

export function canEditEmployee(role: AdminRole): boolean {
  return role === 'superadmin' || role === 'hr'
}

export function canViewEmployee(role: AdminRole): boolean {
  return role === 'superadmin' || role === 'hr' || role === 'admin'
}

export function canEditInventory(role: AdminRole): boolean {
  return role === 'superadmin' || role === 'admin'
}

export function canViewInventory(role: AdminRole): boolean {
  return role === 'superadmin' || role === 'admin' || role === 'hr'
}
