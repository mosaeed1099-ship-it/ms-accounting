// Writes auth events to the same ms_error_log key used by the vanilla app (_EL)
// This means System Logs screen shows auth events from BOTH versions

const KEY = 'ms_error_log'
const MAX = 500

type AuthEvent =
  | 'login_success'
  | 'login_fail'
  | 'logout'
  | 'session_restore'
  | 'token_error'
  | 'redirect_error'
  | 'permission_denied'

export function logAuth(event: AuthEvent, detail: string = '') {
  try {
    const entry = {
      ts: Date.now(),
      type: 'auth',
      message: event,
      detail,
      source: 'react-app',
    }
    const raw = localStorage.getItem(KEY)
    const list: unknown[] = raw ? JSON.parse(raw) : []
    list.unshift(entry)
    if (list.length > MAX) list.length = MAX
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {}
}

// Track login success/fail counts (persisted across sessions)
const STATS_KEY = 'ms_auth_stats'

export function incrementAuthStat(field: 'success' | 'fail') {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    const stats = raw ? JSON.parse(raw) : { success: 0, fail: 0 }
    stats[field] = (stats[field] || 0) + 1
    stats.last_updated = new Date().toISOString()
    localStorage.setItem(STATS_KEY, JSON.stringify(stats))
  } catch {}
}

export function getAuthStats(): { success: number; fail: number; last_updated?: string } {
  try {
    const raw = localStorage.getItem(STATS_KEY)
    return raw ? JSON.parse(raw) : { success: 0, fail: 0 }
  } catch {
    return { success: 0, fail: 0 }
  }
}
