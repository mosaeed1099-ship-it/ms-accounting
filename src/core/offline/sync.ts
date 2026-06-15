import { flush, size } from './queue'
import type { QueuedRequest } from './types'

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || 'https://ms-accounting-api-production.up.railway.app')
  : ''

function getToken(): string | null {
  return localStorage.getItem('token')
}

async function executeItem(item: QueuedRequest): Promise<{ status: number }> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(item.conflictTs ? { 'X-If-Unmodified-Since': item.conflictTs } : {}),
  }

  const res = await fetch(`${API_BASE}${item.url}`, {
    method: item.method,
    headers,
    body: item.body != null ? JSON.stringify(item.body) : undefined,
  })

  return { status: res.status }
}

export function startSyncEngine(): void {
  // Flush on coming back online
  window.addEventListener('online', () => {
    if (size() > 0) flush(executeItem)
  })

  // Flush when WebSocket reconnects (event dispatched by realtime/socket.ts)
  window.addEventListener('ms:ws:connected', () => {
    if (size() > 0) flush(executeItem)
  })

  // Flush on page focus (catches tab switching while offline)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && navigator.onLine && size() > 0) {
      flush(executeItem)
    }
  })
}

export { flush, executeItem }
