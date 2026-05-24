import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Phone, Mail, MapPin, User, TrendingUp, XCircle, Clock, CheckCircle2, RefreshCw } from 'lucide-react'
import api from '../api/client'
import { toast } from '../hooks/useToast'
import { Modal } from '../components/ui/Modal'
import { PageLoader } from '../components/ui/Spinner'

const STATUS_LABELS: Record<string, string> = {
  new: 'جديد', interested: 'مهتم', meeting: 'اجتماع',
  quotation_sent: 'عرض مرسل', paid: 'دفع',
  under_establishment: 'قيد التأسيس', tax_registered: 'مسجل ضريبياً',
  accounting_client: 'عميل محاسبة', inactive: 'غير نشط', lost: 'خسارة',
}

const STATUS_BADGE: Record<string, string> = {
  new: 'badge-blue', interested: 'badge-purple', meeting: 'badge-yellow',
  quotation_sent: 'badge-yellow', paid: 'badge-green',
  under_establishment: 'badge-blue', tax_registered: 'badge-green',
  accounting_client: 'badge-green', inactive: 'badge-gray', lost: 'badge-red',
}

const SOURCE_LABELS: Record<string, string> = {
  referral: 'توصية', social_media: 'سوشيال', walk_in: 'زيارة مباشرة',
  website: 'الموقع', phone: 'اتصال', other: 'أخرى',
}

const COMPANY_TYPE_LABELS: Record<string, string> = {
  llc: 'شركة ذات مسؤولية محدودة', sole: 'مؤسسة فردية',
  partnership: 'شركة تضامن', joint_stock: 'شركة مساهمة', other: 'أخرى',
}

const SERVICE_LABELS: Record<string, string> = {
  establishment: 'تأسيس شركة', tax: 'خدمات ضريبية',
  accounting: 'محاسبة', audit: 'مراجعة', payroll: 'مرتبات', other: 'أخرى',
}

export default function Leads() {
  const [leads, setLeads] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState<any>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = { limit: 100 }
      if (search) params.q = search
      if (statusFilter) params.status = statusFilter
      const [leadsRes, statsRes] = await Promise.all([
        api.get('/api/leads', { params }),
        api.get('/api/leads/stats'),
      ])
      setLeads(leadsRes.data.items)
      setStats(statsRes.data)
    } catch { toast('خطأ في تحميل البيانات', 'error') }
    finally { setLoading(false) }
  }, [search, statusFilter])

  useEffect(() => { load() }, [load])

  async function deleteLead(id: number) {
    if (!confirm('حذف هذا العميل المحتمل؟')) return
    try {
      await api.delete(`/api/leads/${id}`)
      toast('تم الحذف')
      load()
    } catch { toast('خطأ في الحذف', 'error') }
  }

  if (loading && !leads.length) return <PageLoader />

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="page-title">إدارة العملاء المحتملين (CRM)</h2>
          <p className="page-subtitle">تتبع وإدارة الفرص البيعية</p>
        </div>
        <button className="btn-primary" onClick={() => { setSelected(null); setShowAdd(true) }}>
          <Plus className="w-4 h-4" /> إضافة عميل محتمل
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: 'الإجمالي', value: stats.total, icon: User, color: 'bg-blue-50 text-blue-600' },
            { label: 'جديد', value: stats.new, icon: Plus, color: 'bg-purple-50 text-purple-600' },
            { label: 'قيد المتابعة', value: stats.in_progress, icon: Clock, color: 'bg-yellow-50 text-yellow-600' },
            { label: 'تحوّل لعميل', value: stats.converted, icon: CheckCircle2, color: 'bg-green-50 text-green-600' },
            { label: 'خسارة', value: stats.lost, icon: XCircle, color: 'bg-red-50 text-red-600' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="stat-card">
              <div className={`stat-icon ${color}`}><Icon className="w-5 h-5" /></div>
              <div>
                <div className="text-2xl font-bold text-gray-900">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              className="input pr-9"
              placeholder="بحث بالاسم أو الهاتف..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select className="input w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">كل الحالات</option>
            {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button className="btn-secondary" onClick={load}>
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>الاسم</th>
              <th>الهاتف</th>
              <th>الخدمة المطلوبة</th>
              <th>المصدر</th>
              <th>الحالة</th>
              <th>المحافظة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {leads.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-12 text-gray-400">لا توجد بيانات</td></tr>
            ) : leads.map(lead => (
              <tr key={lead.id}>
                <td className="text-xs text-gray-400 font-mono">{lead.code}</td>
                <td>
                  <div className="font-medium text-gray-900">{lead.name}</div>
                  {lead.company_name && <div className="text-xs text-gray-400">{lead.company_name}</div>}
                </td>
                <td>
                  <div className="flex items-center gap-1 text-sm">
                    {lead.phone && <><Phone className="w-3.5 h-3.5 text-gray-400" />{lead.phone}</>}
                  </div>
                  {lead.email && (
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <Mail className="w-3 h-3" />{lead.email}
                    </div>
                  )}
                </td>
                <td className="text-sm">{SERVICE_LABELS[lead.service_requested] || lead.service_requested}</td>
                <td className="text-sm text-gray-500">{SOURCE_LABELS[lead.source] || lead.source}</td>
                <td><span className={`badge ${STATUS_BADGE[lead.status] || 'badge-gray'}`}>{STATUS_LABELS[lead.status] || lead.status}</span></td>
                <td>
                  {lead.governorate && (
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <MapPin className="w-3 h-3" />{lead.governorate}
                    </div>
                  )}
                </td>
                <td>
                  <div className="flex gap-2">
                    <button className="btn-sm btn-secondary" onClick={() => { setSelected(lead); setShowAdd(true) }}>تعديل</button>
                    <button className="btn-sm btn-danger" onClick={() => deleteLead(lead.id)}>حذف</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <LeadModal
          lead={selected}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load() }}
        />
      )}
    </div>
  )
}

function LeadModal({ lead, onClose, onSaved }: { lead: any; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: lead?.name || '',
    phone: lead?.phone || '',
    email: lead?.email || '',
    company_name: lead?.company_name || '',
    governorate: lead?.governorate || '',
    status: lead?.status || 'new',
    source: lead?.source || 'other',
    service_requested: lead?.service_requested || 'establishment',
    company_type: lead?.company_type || '',
    estimated_capital: lead?.estimated_capital || '',
    notes: lead?.notes || '',
    lost_reason: lead?.lost_reason || '',
  })

  function set(key: string, val: string) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave() {
    if (!form.name) { toast('الاسم مطلوب', 'error'); return }
    setSaving(true)
    try {
      const payload = { ...form, estimated_capital: form.estimated_capital ? +form.estimated_capital : null }
      if (lead) await api.put(`/api/leads/${lead.id}`, payload)
      else await api.post('/api/leads', payload)
      toast(lead ? 'تم التحديث' : 'تم الإضافة')
      onSaved()
    } catch (e: any) { toast(e.response?.data?.detail || 'خطأ', 'error') }
    finally { setSaving(false) }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={lead ? 'تعديل عميل محتمل' : 'إضافة عميل محتمل جديد'}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>إلغاء</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-group">
            <label className="label">الاسم *</label>
            <input className="input" value={form.name} onChange={e => set('name', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">الهاتف</label>
            <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">البريد الإلكتروني</label>
            <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">اسم الشركة</label>
            <input className="input" value={form.company_name} onChange={e => set('company_name', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">المحافظة</label>
            <input className="input" value={form.governorate} onChange={e => set('governorate', e.target.value)} placeholder="القاهرة، الجيزة..." />
          </div>
          <div className="form-group">
            <label className="label">الخدمة المطلوبة</label>
            <select className="input" value={form.service_requested} onChange={e => set('service_requested', e.target.value)}>
              {Object.entries(SERVICE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">المصدر</label>
            <select className="input" value={form.source} onChange={e => set('source', e.target.value)}>
              {Object.entries(SOURCE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">الحالة</label>
            <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">نوع الشركة</label>
            <select className="input" value={form.company_type} onChange={e => set('company_type', e.target.value)}>
              <option value="">اختر...</option>
              {Object.entries(COMPANY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">رأس المال المتوقع (جنيه)</label>
            <input className="input" type="number" value={form.estimated_capital} onChange={e => set('estimated_capital', e.target.value)} />
          </div>
        </div>
        {form.status === 'lost' && (
          <div className="form-group">
            <label className="label">سبب الخسارة</label>
            <input className="input" value={form.lost_reason} onChange={e => set('lost_reason', e.target.value)} />
          </div>
        )}
        <div className="form-group">
          <label className="label">ملاحظات</label>
          <textarea className="input" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
