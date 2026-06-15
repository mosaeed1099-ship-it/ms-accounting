import { ExponentialBackoff } from './reconnect'
import { emit } from './events'
import type { WsMessage } from './types'

const WS_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_WS_URL || 'wss://ms-accounting-api-production.up.railway.app')
  : 'ws://localhost:8000'

let _ws: WebSocket | null = null
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null
let _stopped = false
const _backoff = new ExponentialBackoff()

function getToken(): string | null {
  return localStorage.getItem('token')
}

function cleanup(): void {
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null }
  if (_ws) {
    _ws.onopen = _ws.onclose = _ws.onerror = _ws.onmessage = null
    _ws.close()
    _ws = null
  }
}

function connect(): void {
  if (_stopped) return
  const token = getToken()
  if (!token) return

  cleanup()
  try {
    _ws = new WebSocket(`${WS_BASE}/ws?token=${token}`)
  } catch {
    scheduleReconnect()
    return
  }

  _ws.onopen = () => {
    _backoff.reset()
    window.dispatchEvent(new CustomEvent('ms:ws:connected'))
  }

  _ws.onmessage = (e) => {
    try {
      const msg: WsMessage = JSON.parse(e.data)
      if (msg.type && msg.type !== 'ping') emit(msg.type, msg.payload ?? null)
    } catch { /* ignore malformed */ }
  }

  _ws.onclose = () => {
    window.dispatchEvent(new CustomEvent('ms:ws:disconnected'))
    if (!_stopped) scheduleReconnect()
  }

  _ws.onerror = () => {
    _ws?.close()
  }
}

function scheduleReconnect(): void {
  const delay = _backoff.next()
  _reconnectTimer = setTimeout(connect, delay)
}

export function startSocket(): void {
  _stopped = false
  connect()
}

export function stopSocket(): void {
  _stopped = true
  cleanup()
}

export function getSocketState(): number {
  return _ws?.readyState ?? WebSocket.CLOSED
}
