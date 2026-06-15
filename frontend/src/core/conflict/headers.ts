/**
 * Build the X-If-Unmodified-Since header value from a record's updated_at.
 * Returns null if no timestamp → conflict check skipped server-side.
 */
export function buildConflictHeader(updatedAt: string | null | undefined): string | null {
  if (!updatedAt) return null
  return updatedAt
}

export function injectConflictHeader(
  headers: Record<string, string>,
  conflictTs: string | null | undefined,
): Record<string, string> {
  const ts = buildConflictHeader(conflictTs)
  if (!ts) return headers
  return { ...headers, 'X-If-Unmodified-Since': ts }
}
