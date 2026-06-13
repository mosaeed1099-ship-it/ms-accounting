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
      // With HashRouter: redirect to /#/login (no server request)
      if (!window.location.hash.includes('/login')) {
        logAuth('redirect_error', 'token invalid → redirecting to #/login')
        window.location.hash = '#/login'
      }
    }
    const message = error.response?.data?.detail || 'حدث خطأ غير متوقع'
    return Promise.reject(new Error(typeof message === 'string' ? message : JSON.stringify(message)))
  }
)

export default api
