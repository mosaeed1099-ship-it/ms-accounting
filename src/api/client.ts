import axios from 'axios'
import { logAuth } from '../utils/authLogger'

// In dev: Vite proxy forwards /api → localhost:8000
// In prod: direct call to Railway API
const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || 'https://ms-accounting-api-production.up.railway.app')
  : ''

const api = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      logAuth('token_error', `401 on ${error.config?.url ?? ''}`)
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      sessionStorage.removeItem('token')
      sessionStorage.removeItem('user')
      // Redirect to login within this app's base path
      const loginPath = import.meta.env.BASE_URL + 'login'
      if (!window.location.pathname.endsWith('/login')) {
        logAuth('redirect_error', `redirecting to ${loginPath}`)
        window.location.href = loginPath
      }
    }
    const message = error.response?.data?.detail || 'حدث خطأ غير متوقع'
    return Promise.reject(new Error(typeof message === 'string' ? message : JSON.stringify(message)))
  }
)

export default api
