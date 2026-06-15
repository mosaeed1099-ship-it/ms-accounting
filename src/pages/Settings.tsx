import { useState, useEffect, useCallback } from 'react'
import { Save, UserPlus, Shield } from 'lucide-react'
import { coreApi } from '../core'
import { toast } from '../hooks/useToast'
import { useAuthStore } from '../store/authStore'
import { Modal } from '../components/ui/Modal'
import { PageLoader } from '../components/ui/Spinner'

const ROLE_LABELS: Record<string, string> = {
  admin: 'مدير النظام', manager: 'مدير', accountant: 'محاسب', viewer: 'مشاهد',
}
const ROLE_BADGE: Record<string, string> = {
  admin: 'badge-red', manager: 'badge-purple', accountant: 'badge-blue', viewer: 'badge-gray',
}

export default function Settings() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<'profile' | 'users' | 'security'>('profile')

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h2 className="page-title">الإعدادات</h2>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {[
          { id: 'profile', label: 'الملف الشخصي' },
          { id: 'users', label: 'المستخدمون' },
          { id: 'security', label: 'الأمان' },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'profile' && <ProfileTab />}
      {tab === 'users' && user?.role === 'admin' && <UsersTab />}
      {tab === 'security' && <SecurityTab />}
    </div>
  )
}

// ─── profile tab ──────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user, updateUser } = useAuthStore()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: user?.name || '', phone: user?.phone || '' })

  async function handleSave() {
    setSaving(true)
    try {
      const res = await coreApi('PUT', `/users/${user?.id}`, form)
      if (res !== null) {
        updateUser({ name: form.name, phone: form.phone })
        toast('تم حفظ التعديلات')
      }
    } catch (e: any) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="card max-w-lg">
      <div className="card-header"><h3 className="font-bold text-gray-900">معلومات الحساب</h3></div>
      <div className="card-body space-y-4">
        <div className="flex items-center gap-4 mb-2">
          <div className="w-16 h-16 rounded-full bg-primary-600 flex items-center justify-center text-white text-2xl font-bold">
            {user?.name?.charAt(0)}
          </div>
          <div>
            <div className="font-semibold text-gray-900">{user?.name}</div>
            <div className="text-sm text-gray-400">{user?.email}</div>
            <span className={`badge ${ROLE_BADGE[user?.role || 'viewer']} mt-1`}>{ROLE_LABELS[user?.role || 'viewer']}</span>
          </div>
        </div>
        <div className="form-group">
          <label className="label">الاسم</label>
          <input className="input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="label">الهاتف</label>
          <input className="input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="label">البريد الإلكتروني</label>
          <input className="input bg-gray-50 text-gray-400 cursor-not-allowed" value={user?.email || ''} disabled />
        </div>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4" />{saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
        </button>
      </div>
    </div>
  )
}

// ─── users tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await coreApi<any[]>('GET', '/users')
    if (res) setUsers(res)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function toggleUser(u: any) {
    const res = await coreApi('PUT', `/users/${u.id}`, { is_active: !u.is_active })
    if (res !== null) { toast(u.is_active ? 'تم تعطيل المستخدم' : 'تم تفعيل المستخدم'); load() }
  }

  if (loading) return <PageLoader />

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setShowAdd(true)}>
          <UserPlus className="w-4 h-4" /> إضافة مستخدم
        </button>
      </div>
      <div className="card">
        <div className="table-container rounded-none border-0">
          <table className="table">
            <thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>الدور</th><th>الحالة</th><th></th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td className="font-medium">{u.name}</td>
                  <td className="text-sm text-gray-500">{u.email}</td>
                  <td><span className={`badge ${ROLE_BADGE[u.role]}`}>{ROLE_LABELS[u.role]}</span></td>
                  <td><span className={u.is_active ? 'badge-green badge' : 'badge-gray badge'}>{u.is_active ? 'نشط' : 'معطل'}</span></td>
                  <td>
                    <button className={`btn-sm ${u.is_active ? 'btn-secondary' : 'btn-success'}`} onClick={() => toggleUser(u)}>
                      {u.is_active ? 'تعطيل' : 'تفعيل'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load() }} />}
    </div>
  )
}

function AddUserModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', role: 'accountant' })

  async function handleSave() {
    if (!form.name || !form.email || !form.password) { toast('يرجى ملء جميع الحقول المطلوبة', 'error'); return }
    setSaving(true)
    try {
      const res = await coreApi('POST', '/users', form)
      if (res !== null) { toast('تم إضافة المستخدم بنجاح'); onSaved() }
    } catch (e: any) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <Modal isOpen onClose={onClose} title="إضافة مستخدم جديد" size="sm"
      footer={<><button className="btn-secondary" onClick={onClose}>إلغاء</button><button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? '...' : 'إضافة'}</button></>}
    >
      <div className="space-y-3">
        {[
          { label: 'الاسم *', key: 'name', type: 'text' },
          { label: 'البريد الإلكتروني *', key: 'email', type: 'email' },
          { label: 'كلمة المرور *', key: 'password', type: 'password' },
          { label: 'الهاتف', key: 'phone', type: 'text' },
        ].map(f => (
          <div key={f.key} className="form-group">
            <label className="label">{f.label}</label>
            <input type={f.type} className="input" value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
          </div>
        ))}
        <div className="form-group">
          <label className="label">الدور</label>
          <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
            {Object.entries(ROLE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
    </Modal>
  )
}

// ─── security tab ─────────────────────────────────────────────────────────────

function SecurityTab() {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })

  async function handleChange() {
    if (form.new_password !== form.confirm) { toast('كلمات المرور غير متطابقة', 'error'); return }
    if (form.new_password.length < 6) { toast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error'); return }
    setSaving(true)
    try {
      const res = await coreApi('POST', '/auth/change-password', {
        current_password: form.current_password,
        new_password: form.new_password,
      })
      if (res !== null) {
        toast('تم تغيير كلمة المرور بنجاح')
        setForm({ current_password: '', new_password: '', confirm: '' })
      }
    } catch (e: any) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="card max-w-md">
      <div className="card-header"><h3 className="font-bold text-gray-900">تغيير كلمة المرور</h3></div>
      <div className="card-body space-y-4">
        {[
          { label: 'كلمة المرور الحالية', key: 'current_password' },
          { label: 'كلمة المرور الجديدة', key: 'new_password' },
          { label: 'تأكيد كلمة المرور', key: 'confirm' },
        ].map(f => (
          <div key={f.key} className="form-group">
            <label className="label">{f.label}</label>
            <input type="password" className="input" value={(form as any)[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} />
          </div>
        ))}
        <button className="btn-primary" onClick={handleChange} disabled={saving}>
          <Shield className="w-4 h-4" />{saving ? 'جاري الحفظ...' : 'تغيير كلمة المرور'}
        </button>
      </div>
    </div>
  )
}
