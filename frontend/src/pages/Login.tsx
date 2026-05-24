import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Eye, EyeOff, Loader2 } from 'lucide-react'
import api from '../api/client'
import { useAuthStore } from '../store/authStore'
import { toast } from '../hooks/useToast'

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [form, setForm] = useState({ email: 'admin@ms-accounting.com', password: 'Admin@123' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    try {
      const body = new URLSearchParams({ username: form.email, password: form.password })
      const { data } = await api.post('/auth/login', body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      setAuth(data.user, data.access_token)
      navigate('/')
    } catch (err: any) {
      toast(err.message || 'خطأ في تسجيل الدخول', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-white/10 backdrop-blur rounded-2xl flex items-center justify-center mx-auto mb-4 border border-white/20">
            <Building2 className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">MS Accounting</h1>
          <p className="text-primary-200 mt-1 text-sm">نظام إدارة مكتب المحاسبة</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">تسجيل الدخول</h2>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">البريد الإلكتروني</label>
              <input
                type="email"
                className="input"
                placeholder="admin@ms-accounting.com"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="label">كلمة المرور</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  className="input pl-10"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn-primary w-full btn-lg justify-center" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {loading ? 'جاري تسجيل الدخول...' : 'دخول'}
            </button>
          </form>

          <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <p className="text-xs text-blue-700 font-medium mb-1">بيانات الدخول الافتراضية:</p>
            <p className="text-xs text-blue-600">البريد: admin@ms-accounting.com</p>
            <p className="text-xs text-blue-600">كلمة المرور: Admin@123</p>
          </div>
        </div>

        <p className="text-center text-primary-300 text-xs mt-6">
          MS Accounting v1.0 © 2024 — جميع الحقوق محفوظة
        </p>
      </div>
    </div>
  )
}
