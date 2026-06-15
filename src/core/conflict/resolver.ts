import type { ConflictInfo } from './types'
import { notifyConflict, CONFLICT_MESSAGE } from './detector'

/**
 * Called when a 409 is received.
 * Shows a toast notification and fires the global conflict event.
 * Returns false so callers know the operation did not succeed.
 */
export function resolveConflict(info: ConflictInfo): false {
  // Lazy import to avoid circular deps with toast
  import('../../hooks/useToast').then(({ toast }) => {
    toast(CONFLICT_MESSAGE, 'error')
  })
  notifyConflict(info)
  return false
}
