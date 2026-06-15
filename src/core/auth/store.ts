// Re-export existing authStore so core/auth/store is the canonical import.
// The underlying store already handles vanilla-compatible localStorage keys.
export { useAuthStore } from '../../store/authStore'
export type { } from './types'
