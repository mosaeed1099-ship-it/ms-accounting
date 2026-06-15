import type { QueuedRequest } from './types'
import type { HttpMethod } from '../api/types'
import { loadQueue, saveQueue, pushToStorage } from './storage'

let _flushLock = false

function uid(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function enqueue(
  method: HttpMethod,
  url: string,
  body: unknown,
  label: string,
  conflictTs: string | null,
): void {
  const item: QueuedRequest = {
    id: uid(),
    method,
    url,
    body,
    label,
    conflictTs,
    retries: 0,
    queuedAt: Date.now(),
  }
  pushToStorage(item)
  dispatchQueueEvent()
}

export function getQueue(): QueuedRequest[] {
  return loadQueue()
}

export function size(): number {
  return loadQueue().length
}

/**
 * Flush the queue FIFO.
 * - 4xx → discard (bad request, auth error — won't succeed on retry)
 * - 5xx / network → stop flush, leave remainder in queue
 * - 409 → discard + notify conflict
 */
export async function flush(
  executor: (item: QueuedRequest) => Promise<{ status: number }>,
  onConflict?: (item: QueuedRequest, serverTs: string | null) => void,
): Promise<void> {
  if (_flushLock) return
  _flushLock = true

  try {
    let queue = loadQueue()
    while (queue.length > 0) {
      const item = queue[0]
      try {
        const res = await executor(item)

        if (res.status === 409) {
          onConflict?.(item, null)
          queue.shift()
        } else if (res.status >= 400 && res.status < 500) {
          // 4xx — discard silently (duplicate, bad input, etc.)
          queue.shift()
        } else if (res.status >= 500) {
          // 5xx — server error, stop and retry later
          break
        } else {
          queue.shift()
        }
      } catch {
        // Network error — stop
        break
      }
      saveQueue(queue)
    }
  } finally {
    _flushLock = false
    dispatchQueueEvent()
  }
}

function dispatchQueueEvent(): void {
  window.dispatchEvent(new CustomEvent('ms:queue:change', { detail: { size: size() } }))
}
