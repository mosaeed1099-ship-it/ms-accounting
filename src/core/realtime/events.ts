import type { WsEventType, WsListener } from './types'

const _listeners = new Map<WsEventType, Set<WsListener>>()

export function on(event: WsEventType, fn: WsListener): () => void {
  if (!_listeners.has(event)) _listeners.set(event, new Set())
  _listeners.get(event)!.add(fn)
  return () => off(event, fn)
}

export function off(event: WsEventType, fn: WsListener): void {
  _listeners.get(event)?.delete(fn)
}

export function emit(event: WsEventType, payload: unknown): void {
  _listeners.get(event)?.forEach((fn) => fn(payload))
}
