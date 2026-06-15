/**
 * Axios interceptors for the legacy api/client.ts (still used by existing pages).
 * Wires conflict detection into axios responses so pages get 409 handling
 * without needing to be rewritten yet.
 */
import axiosInstance from '../../api/client'
import { parseConflictResponse, notifyConflict, CONFLICT_MESSAGE } from '../conflict/detector'

export function attachInterceptors(): void {
  axiosInstance.interceptors.response.use(
    (res) => res,
    async (error) => {
      if (error.response?.status === 409) {
        const serverTs = parseConflictResponse(error.response.data)
        notifyConflict({
          recordId: '',
          label: error.config?.url ?? '',
          serverUpdatedAt: serverTs,
          localBody: null,
        })
        const { toast } = await import('../../hooks/useToast')
        toast(CONFLICT_MESSAGE, 'error')
      }
      return Promise.reject(error)
    },
  )
}
