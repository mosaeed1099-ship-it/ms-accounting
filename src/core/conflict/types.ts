export interface ConflictInfo {
  recordId: string | number
  label: string
  serverUpdatedAt: string | null
  localBody: unknown
}
