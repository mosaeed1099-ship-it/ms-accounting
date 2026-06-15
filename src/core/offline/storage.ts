import type { QueuedRequest } from './types'

const KEY = 'ms_offline_queue'

export function loadQueue(): QueuedRequest[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

export function saveQueue(queue: QueuedRequest[]): void {
  localStorage.setItem(KEY, JSON.stringify(queue))
}

export function pushToStorage(item: QueuedRequest): void {
  const q = loadQueue()
  q.push(item)
  saveQueue(q)
}

export function clearStorage(): void {
  localStorage.removeItem(KEY)
}
