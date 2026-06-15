import type { HttpMethod } from '../api/types'

export interface QueuedRequest {
  id: string
  method: HttpMethod
  url: string
  body: unknown
  label: string
  conflictTs: string | null
  retries: number
  queuedAt: number
}
