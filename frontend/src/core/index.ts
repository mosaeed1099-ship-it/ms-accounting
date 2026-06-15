// API
export { coreApi, flushQueue } from './api/client'
export { EP } from './api/endpoints'
export type { HttpMethod, ApiRequestOptions, ApiError } from './api/types'

// Offline Queue
export { enqueue, getQueue, size as queueSize, flush } from './offline/queue'
export { startSyncEngine } from './offline/sync'
export type { QueuedRequest } from './offline/types'

// Conflict Detection
export { notifyConflict, parseConflictResponse, CONFLICT_MESSAGE } from './conflict/detector'
export { resolveConflict } from './conflict/resolver'
export { buildConflictHeader, injectConflictHeader } from './conflict/headers'
export type { ConflictInfo } from './conflict/types'

// Real-time WebSocket
export { startSocket, stopSocket, getSocketState } from './realtime/socket'
export { on as wsOn, off as wsOff, emit as wsEmit } from './realtime/events'
export type { WsEventType, WsMessage, WsListener } from './realtime/types'

// Auth
export { useAuthStore } from './auth/store'
export { canWrite, canAdmin, isAdmin } from './auth/guards'
export type { AuthUser, AuthState } from './auth/types'
