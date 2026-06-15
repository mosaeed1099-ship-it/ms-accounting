import type { AuthUser } from './types'

export function canWrite(user: AuthUser | null): boolean {
  return !!user && user.role !== 'viewer'
}

export function canAdmin(user: AuthUser | null): boolean {
  return !!user && (user.role === 'admin' || user.role === 'manager')
}

export function isAdmin(user: AuthUser | null): boolean {
  return user?.role === 'admin'
}
