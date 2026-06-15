export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ApiRequestOptions {
  /** Pass updated_at of the record to enable conflict detection */
  conflictTs?: string | null
  /** Queue this request when offline instead of failing */
  queue?: boolean
  /** Label shown in UI for queued requests */
  queueLabel?: string
  /** Skip cache, force fresh fetch */
  useCache?: boolean
  signal?: AbortSignal
}

export interface ApiError {
  status: number
  message: string
  conflict?: boolean
  serverUpdatedAt?: string
}
