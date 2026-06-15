export interface AuthUser {
  id: number
  name: string
  email: string
  role: 'admin' | 'manager' | 'accountant' | 'viewer'
  is_active: boolean
}

export interface AuthState {
  user: AuthUser | null
  token: string | null
  isAuthenticated: boolean
}
