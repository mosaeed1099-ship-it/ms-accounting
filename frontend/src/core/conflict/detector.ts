import type { ConflictInfo } from './types'

/** Fires a global event so any component can react to a 409. */
export function notifyConflict(info: ConflictInfo): void {
  window.dispatchEvent(new CustomEvent('ms:conflict', { detail: info }))
}

/**
 * Extract conflict info from a 409 response body.
 * Backend returns: { conflict: true, message: string, server_updated_at: string }
 */
export function parseConflictResponse(body: unknown): string | null {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>
    if (b.server_updated_at) return b.server_updated_at as string
    if (b.detail && typeof b.detail === 'object') {
      const d = b.detail as Record<string, unknown>
      if (d.server_updated_at) return d.server_updated_at as string
    }
  }
  return null
}

export const CONFLICT_MESSAGE =
  'تم تعديل هذا السجل من مستخدم آخر. يُرجى تحديث الصفحة للحصول على أحدث البيانات.'
