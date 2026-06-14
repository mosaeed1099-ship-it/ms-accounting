import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { User } from '../types'
import { logAuth } from '../utils/authLogger'

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  rememberMe: boolean
  setAuth: (user: User, token: string, rememberMe?: boolean) => void
  logout: () => void
  updateUser: (user: Partial<User>) => void
}

// Custom storage that reads/writes the SAME keys as the vanilla app
// vanilla uses: localStorage.token + localStorage.user
// This ensures one login works in BOTH the vanilla and React versions (Dual Run)
const vanillaCompatibleStorage = createJSONStorage(() => ({
  getItem: (_key: string): string | null => {
    const token = localStorage.getItem('token')
    if (!token) return null
    let user: User | null = null
    try { user = JSON.parse(localStorage.getItem('user') || 'null') } catch {}
    return JSON.stringify({
      state: { token, user, isAuthenticated: true, rememberMe: true },
      version: 0,
    })
  },
  setItem: (_key: string, value: string) => {
    try {
      const parsed = JSON.parse(value)
      const { token, user, rememberMe } = parsed.state ?? {}
      const storage = rememberMe === false ? sessionStorage : localStorage
      if (token) {
        storage.setItem('token', token)
        if (user) storage.setItem('user', JSON.stringify(user))
        // Always write to localStorage too so vanilla can read it in Dual Run mode
        if (rememberMe === false) {
          localStorage.setItem('token', token)
          localStorage.setItem('user', JSON.stringify(user ?? null))
        }
      } else {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        sessionStorage.removeItem('token')
        sessionStorage.removeItem('user')
      }
    } catch {}
  },
  removeItem: (_key: string) => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
  },
}))

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      rememberMe: true,

      setAuth: (user, token, rememberMe = true) => {
        logAuth('login_success', `user=${user.email} role=${user.role} remember=${rememberMe}`)
        set({ user, token, isAuthenticated: true, rememberMe })
      },

      logout: () => {
        logAuth('logout', 'user logged out')
        set({ user: null, token: null, isAuthenticated: false, rememberMe: true })
      },

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
    }),
    {
      name: 'ms-auth-compat',
      storage: vanillaCompatibleStorage,
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        rememberMe: state.rememberMe,
      }),
    }
  )
)
