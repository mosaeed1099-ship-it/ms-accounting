import { useState, useEffect, useCallback } from 'react'
import { Plus, Building2, CheckCircle2, Clock, AlertCircle, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import api from '../api/client'
import { toast } from '../hooks/useToast'
import { Modal } from '../components/ui/Modal'
import { PageLoader } from '../components/ui/Spinner'

const STATUS_LABELS: Record<string, string> = {
  in_progress: 'قيد التنفيذ', done: 'مكتمل', pending: 'معلق', cancelled: 'ملغي',
}
const STATUS_BADGE: Record<string, string> = {
  in_progress: 'badge-blue', done: 'badge-green', pending: 'badge-gray', cancelled: 'badge-red',
}

const STAGE_STATUS_BADGE: Record<string, string> = {
  pending: 'badge-gray', in_progress: 'badge-yellow', done: 'badge-green', blocked: 'badge-red',
}
const STAGE_STATUS_LABELS: Record<string, string> = {
  pending: 'لم يبدأ', in_progress: 'جاري', done: 'مكتمل', blocked: 'موقوف',
}

const STAGE_KEYS = [
  { key: 'name_reservation', label: 'حجز الاسم التجاري' },
  { key: 'commercial_register', label: 'السجل التجاري' },
  { key: 'tax_card', label: 'البطاقة الضريبية' },
  { key: 'vat_registration', label: 'تسجيل ضريبة القيمة المضافة' },
  { key: 'insurance', label: 'التأمينات الاجتماعية' },
  { key: 'bank_account', label: 'الحساب البنكي' },
]

const COMPANY_TYPES: Record<string, string> = {
  llc: 'ذات مسؤولية محدودة', sole: 'مؤسسة فردية',
  partnership: 'شركة تضامن', joint_stock: 'شركة مساهمة', other: 'أخرى',
}

export default function Establishment() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = {}
      if (statusFilter) params.status = statusFilter
      const { data } = await api.get('/api/establishment', { params })
      setItems(data.items)
    } catch { toast('خطأ في تحميل البيانات', 'error') }
    finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => { load() }, [load])

  if (loading && !items.length) return <PageLoader />

  const stats = {
    total: items.length,
    inProgress: items.filter(i => i.status === 'in_progress').length,
    done: items.filter(i => i.status === 'done').length,
    pending: items.filter(i => i.status === 'pending').length,
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="page-title">تأسيس الشركات</h2>
          <p className="page-subtitle">متابعة إجراءات تأسيس الشركات خطوة بخطوة</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={load}><RefreshCw className="w-4 h-4" /></button>
          <button className="btn-primary" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4" /> ملف تأسيس جديد</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'الإجمالي', value: stats.total, color: 'bg-blue-50 text-blue-600', icon: Building2 },
          { label: 'قيد التنفيذ', value: stats.inProgress, color: 'bg-yellow-50 text-yellow-600', icon: Clock },
          { label: 'مكتملة', value: stats.done, color: 'bg-green-50 text-green-600', icon: CheckCircle2 },
          { label: 'معلقة', value: stats.pending, color: 'bg-gray-50 text-gray-600', icon: AlertCircle },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="stat-card">
            <div className={`stat-icon ${color}`}><Icon className="w-5 h-5" /></div>
            <div><div className="text-2xl font-bold text-gray-900">{value}</div><div className="text-xs text-gray-500">{label}</div></div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div className="card p-4">
        <select className="input w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">كل الحالات</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* List */}
      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="card p-12 text-center text-gray-400">لا توجد ملفات تأسيس</div>
        ) : items.map(est => (
          <div key={est.id} className="card">
            <div
              className="card-header cursor-pointer"
              onClick={() => setExpanded(expanded === est.id ? null : est.id)}
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{est.company_name}</div>
                  <div className="text-xs text-gray-400 flex items-center gap-2">
                    <span className="font-mono">{est.code}</span>
                    {est.company_type && <span>· {COMPANY_TYPES[est.company_type] || est.company_type}</span>}
                    {est.assigned_name && <span>· {est.assigned_name}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Progress bar */}
                <div className="hidden md:flex items-center gap-2">
                  <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full transition-all"
                      style={{ width: `${est.progress || 0}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500">{est.progress || 0}%</span>
                </div>
                <span className={`badge ${STATUS_BADGE[est.status] || 'badge-gray'}`}>
                  {STATUS_LABELS[est.status] || est.status}
                </span>
                {expanded === est.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </div>
            </div>

            {expanded === est.id && (
              <div className="p-6 border-t border-gray-100">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {STAGE_KEYS.map(({ key, label }) => {
                    const stage = est.stages?.find((s: any) => s.key === key)
                    const status = stage?.status || 'pending'
                    return (
                      <StageCard
                        key={key}
                        estId={est.id}
                        stageKey={key}
                        label={label}
                        stage={stage}
                        status={status}
                        onUpdated={load}
                      />
                    )
                  })}
                </div>
                {est.notes && (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                    <span className="font-medium">ملاحظات:</span> {est.notes}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {showAdd && <AddEstablishmentModal onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load() }} />}
    </div>
  )
}

function StageCard({ estId, stageKey, label, stage, status, onUpdated }: any) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newStatus, setNewStatus] = useState(status)
  const [notes, setNotes] = useState(stage?.notes || '')

  async function save() {
    setSaving(true)
    try {
      await api.put(`/api/establishment/${estId}/stage`, { stage_key: stageKey, status: newStatus, notes })
      toast('تم التحديث')
      setEditing(false)
      onUpdated()
    } catch { toast('خطأ', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className={`badge ${STAGE_STATUS_BADGE[status] || 'badge-gray'}`}>{STAGE_STATUS_LABELS[status] || status}</span>
      </div>
      {editing ? (
        <div className="space-y-2">
          <select className="input text-xs" value={newStatus} onChange={e => setNewStatus(e.target.value)}>
            {Object.entries(STAGE_STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input className="input text-xs" placeholder="ملاحظات..." value={notes} onChange={e => setNotes(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn-primary btn-sm flex-1" onClick={save} disabled={saving}>{saving ? '...' : 'حفظ'}</button>
            <button className="btn-secondary btn-sm" onClick={() => setEditing(false)}>إلغاء</button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          {stage?.notes && <span className="text-xs text-gray-400 truncate flex-1">{stage.notes}</span>}
          <button className="btn-ghost btn-sm text-xs mr-auto" onClick={() => setEditing(true)}>تحديث</button>
        </div>
      )}
    </div>
  )
}

function AddEstablishmentModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    company_name: '', company_name_en: '', company_type: 'llc',
    activity: '', governorate: '', capital: '', notes: '',
  })

  function set(key: string, val: string) { setForm(f => ({ ...f, [key]: val })) }

  async function handleSave() {
    if (!form.company_name) { toast('اسم الشركة مطلوب', 'error'); return }
    setSaving(true)
    try {
      await api.post('/api/establishment', { ...form, capital: form.capital ? +form.capital : null })
      toast('تم إنشاء ملف التأسيس')
      onSaved()
    } catch (e: any) { toast(e.response?.data?.detail || 'خطأ', 'error') }
    finally { setSaving(false) }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="ملف تأسيس شركة جديد"
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>إلغاء</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'جاري الحفظ...' : 'إنشاء'}</button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-group">
            <label className="label">اسم الشركة (عربي) *</label>
            <input className="input" value={form.company_name} onChange={e => set('company_name', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">اسم الشركة (إنجليزي)</label>
            <input className="input" value={form.company_name_en} onChange={e => set('company_name_en', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">نوع الشركة</label>
            <select className="input" value={form.company_type} onChange={e => set('company_type', e.target.value)}>
              {Object.entries(COMPANY_TYPES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">رأس المال (جنيه)</label>
            <input className="input" type="number" value={form.capital} onChange={e => set('capital', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">النشاط التجاري</label>
            <input className="input" value={form.activity} onChange={e => set('activity', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">المحافظة</label>
            <input className="input" value={form.governorate} onChange={e => set('governorate', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="label">ملاحظات</label>
          <textarea className="input" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
