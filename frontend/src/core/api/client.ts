import type { HttpMethod, ApiRequestOptions } from './types'
import { injectConflictHeader } from '../conflict/headers'
import { parseConflictResponse, notifyConflict, CONFLICT_MESSAGE } from '../conflict/detector'
import { enqueue } from '../offline/queue'
import { flush, executeItem } from '../offline/sync'

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || 'https://ms-accounting-api-production.up.railway.app')
  : ''

function getToken(): string | null {
  return localStorage.getItem('token')
}

function baseHeaders(conflictTs?: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = getToken()
  if (token) h['Authorization'] = `Bearer ${token}`
  return injectConflictHeader(h, conflictTs)
}

/**
 * Central API function — mirrors the vanilla api() in index.html.
 *
 * - Adds auth token automatically
 * - Injects X-If-Unmodified-Since when conflictTs provided
 * - On 409 → shows conflict toast + fires ms:conflict event
 * - When offline + queue:true → enqueues for later flush
 * - On reconnect / coming online → auto-flushes queue
 */
export async function coreApi<T = unknown>(
  method: HttpMethod,
  path: string,
  body?: unknown,
  opts: ApiRequestOptions = {},
): Promise<T | null> {
  const { conflictTs, queue = false, queueLabel = 'عملية معلقة' } = opts
  const url = `${API_BASE}/api${path}`

  // Offline path — enqueue instead of failing
  if (!navigator.onLine && queue) {
    enqueue(method, `/api${path}`, body ?? null, queueLabel, conflictTs ?? null)
    return null
  }

  const res = await fetch(url, {
    method,
    headers: baseHeaders(conflictTs),
    body: body != null ? JSON.stringify(body) : undefined,
    signal: opts.signal,
  })

  // 401 — clear token, redirect to login
  if (res.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.hash = '#/login'
    return null
  }

  // 409 — conflict
  if (res.status === 409) {
    let bodyJson: unknown = null
    try { bodyJson = await res.json() } catch { /* ignore */ }
    const serverTs = parseConflictResponse(bodyJson)
    notifyConflict({ recordId: '', label: queueLabel, serverUpdatedAt: serverTs, localBody: body })
    const { toast } = await import('../../hooks/useToast')
    toast(CONFLICT_MESSAGE, 'error')
    return null
  }

  // 4xx client error
  if (res.status >= 400 && res.status < 500) {
    let msg = 'حدث خطأ في الطلب'
    try {
      const d = await res.json()
      msg = typeof d.detail === 'string' ? d.detail : JSON.stringify(d.detail)
    } catch { /* ignore */ }
    throw new Error(msg)
  }

  // 5xx — queue if requested, else throw
  if (res.status >= 500) {
    if (queue) {
      enqueue(method, `/api${path}`, body ?? null, queueLabel, conflictTs ?? null)
      return null
    }
    throw new Error('خطأ في الخادم، يُرجى المحاولة لاحقاً')
  }

  if (res.status === 204) return null
  return res.json() as Promise<T>
}

/** Trigger manual queue flush (e.g. after regaining connectivity) */
export function flushQueue(): Promise<void> {
  return flush(executeItem)
}
