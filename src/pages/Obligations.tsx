import { useState, useEffect, useCallback } from 'react'
import { Plus, Bell, CheckCircle2, Clock, AlertTriangle, RefreshCw, Calendar } from 'lucide-react'
import { coreApi, EP, wsOn } from '../core'
import { toast } from '../hooks/useToast'
import { Modal } from '../components/ui/Modal'
import { PageLoader } from '../components/ui/Spinner'

const OBL_TYPE_LABELS: Record<string, string> = {
  vat_monthly: 'ق.م.م شهري', vat_quarterly: 'ق.م.م ربعي',
  income_annual: 'ضريبة الدخل', payroll_monthly: 'مرتبات شهري',
  withholding_monthly: 'خصم وإضافة', stamp_quarterly: 'دمغة ربعي',
}

const INSTANCE_STATUS_BADGE: Record<string, string> = {
  upcoming: 'badge-blue', pending: 'badge-yellow',
  submitted: 'badge-green', late: 'badge-red', exempt: 'badge-gray',
}
const INSTANCE_STATUS_LABELS: Record<string, string> = {
  upcoming: 'قادم', pending: 'معلق', submitted: 'مُقدَّم', late: 'متأخر', exempt: 'معفى',
}

const FREQ_LABELS: Record<string, string> = {
  monthly: 'شهري', quarterly: 'ربعي', annual: 'سنوي',
}

// ─── hook ─────────────────────────────────────────────────────────────────────

function useObligations(days: number) {
  const [upcoming, setUpcoming] = useState<any[]>([])
  const [obligations, setObligations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const [upRes, oblRes] = await Promise.all([
      coreApi<any[]>('GET', `/obligations/upcoming?days=${days}`),
      coreApi<{ items: any[] }>('GET', '/obligations'),
    ])
    if (upRes) setUpcoming(upRes)
    if (oblRes) setObligations(oblRes.items)
    setLoading(false)
  }, [days])

  useEffect(() => { load() }, [load])
  useEffect(() => wsOn('obligations_updated', () => load(true)), [load])

  return { upcoming, obligations, loading, load }
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function Obligations() {
  const [days, setDays] = useState(30)
  const [tab, setTab] = useState<'upcoming' | 'all'>('upcoming')
  const [showAdd, setShowAdd] = useState(false)

  const { upcoming, obligations, loading, load } = useObligations(days)

  if (loading && !upcoming.length && !obligations.length) return <PageLoader />

  const overdue = upcoming.filter(i => i.days_remaining < 0).length
  const dueSoon = upcoming.filter(i => i.days_remaining >= 0 && i.days_remaining <= 7).length

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="page-title">الالتزامات الضريبية</h2>
          <p className="page-subtitle">متابعة مواعيد تقديم الإقرارات الضريبية للعملاء</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => load()}><RefreshCw className="w-4 h-4" /></button>
          <button className="btn-primary" onClick={() => setShowAdd(true)}><Plus className="w-4 h-4" /> إضافة التزام</button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'إجمالي الالتزامات', value: obligations.length, color: 'bg-blue-50 text-blue-600', icon: Bell },
          { label: 'مواعيد قادمة', value: upcoming.length, color: 'bg-purple-50 text-purple-600', icon: Calendar },
          { label: 'هذا الأسبوع', value: dueSoon, color: 'bg-yellow-50 text-yellow-600', icon: Clock },
          { label: 'متأخرة', value: overdue, color: 'bg-red-50 text-red-600', icon: AlertTriangle },
        ].map(({ label, value, color, icon: Icon }) => (
          <div key={label} className="stat-card">
            <div className={`stat-icon ${color}`}><Icon className="w-5 h-5" /></div>
            <div>
              <div className="text-2xl font-bold text-gray-900">{value}</div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {[
          { id: 'upcoming', label: `المواعيد القادمة (${upcoming.length})` },
          { id: 'all', label: `كل الالتزامات (${obligations.length})` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as 'upcoming' | 'all')}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
        {tab === 'upcoming' && (
          <div className="mr-auto flex items-center gap-2 pb-1">
            <span className="text-xs text-gray-500">خلال:</span>
            <select className="input w-auto text-xs py-1" value={days} onChange={e => setDays(+e.target.value)}>
              <option value={7}>7 أيام</option>
              <option value={14}>14 يوم</option>
              <option value={30}>30 يوم</option>
              <option value={60}>60 يوم</option>
            </select>
          </div>
        )}
      </div>

      {tab === 'upcoming' && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>العميل</th><th>نوع الالتزام</th><th>الفترة</th><th>تاريخ الاستحقاق</th><th>المتبقي</th><th>الحالة</th><th></th></tr>
            </thead>
            <tbody>
              {upcoming.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-10 text-gray-400">لا توجد مواعيد قادمة</td></tr>
              ) : upcoming.map(inst => (
                <InstanceRow key={inst.id} inst={inst} onUpdated={() => load(true)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'all' && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr><th>العميل</th><th>نوع الالتزام</th><th>التكرار</th><th>يوم الاستحقاق</th><th>المحاسب</th><th>عدد الفترات</th></tr>
            </thead>
            <tbody>
              {obligations.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400">لا توجد التزامات</td></tr>
              ) : obligations.map(obl => (
                <tr key={obl.id}>
                  <td className="font-medium">{obl.client_name}</td>
                  <td>{OBL_TYPE_LABELS[obl.obligation_type] || obl.obligation_type}</td>
                  <td>{FREQ_LABELS[obl.frequency] || obl.frequency}</td>
                  <td>اليوم {obl.due_day}</td>
                  <td className="text-gray-500 text-sm">{obl.assigned_name || '—'}</td>
                  <td>{obl.instances_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAdd && (
        <AddObligationModal
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); load() }}
        />
      )}
    </div>
  )
}

// ─── instance row — mark submitted ────────────────────────────────────────────

function InstanceRow({ inst, onUpdated }: { inst: any; onUpdated: () => void }) {
  const [updating, setUpdating] = useState(false)

  async function markSubmitted() {
    setUpdating(true)
    const res = await coreApi(
      'PUT',
      EP.OBLIGATION_INSTANCE(inst.id),
      { status: 'submitted', submitted_at: new Date().toISOString() },
      {
        conflictTs: inst.updated_at ?? null,
        queue: true,
        queueLabel: `تسجيل تقديم التزام — ${inst.client_name}`,
      },
    )
    if (res !== null) { toast('تم تسجيل التقديم'); onUpdated() }
    setUpdating(false)
  }

  const isOverdue = inst.days_remaining < 0
  const isSoon = inst.days_remaining >= 0 && inst.days_remaining <= 7

  return (
    <tr className={isOverdue ? 'bg-red-50' : isSoon ? 'bg-yellow-50' : ''}>
      <td className="font-medium">{inst.client_name}</td>
      <td>{OBL_TYPE_LABELS[inst.obligation_type] || inst.obligation_type}</td>
      <td className="text-sm text-gray-500">{inst.period_label}</td>
      <td className="text-sm">{inst.due_date ? new Date(inst.due_date).toLocaleDateString('ar-EG') : '—'}</td>
      <td>
        {isOverdue ? (
          <span className="text-red-600 font-medium text-sm flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" /> متأخر {Math.abs(inst.days_remaining)} يوم
          </span>
        ) : inst.days_remaining === 0 ? (
          <span className="text-orange-600 font-medium text-sm">اليوم!</span>
        ) : (
          <span className={`text-sm ${isSoon ? 'text-yellow-600 font-medium' : 'text-gray-500'}`}>
            {inst.days_remaining} يوم
          </span>
        )}
      </td>
      <td>
        <span className={`badge ${INSTANCE_STATUS_BADGE[inst.status] || 'badge-gray'}`}>
          {INSTANCE_STATUS_LABELS[inst.status] || inst.status}
        </span>
      </td>
      <td>
        {inst.status !== 'submitted' && (
          <button className="btn-success btn-sm" onClick={markSubmitted} disabled={updating}>
            <CheckCircle2 className="w-3.5 h-3.5" /> {updating ? '...' : 'تسجيل تقديم'}
          </button>
        )}
      </td>
    </tr>
  )
}

// ─── add obligation modal ─────────────────────────────────────────────────────

function AddObligationModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [clients, setClients] = useState<any[]>([])
  const [form, setForm] = useState({
    client_id: '',
    obligation_type: 'vat_monthly',
    frequency: 'monthly',
    due_day: '15',
    notes: '',
  })

  useEffect(() => {
    coreApi<{ items: any[] }>('GET', `${EP.CLIENTS}?page_size=200`)
      .then(r => { if (r) setClients(r.items) })
  }, [])

  const set = (key: string, val: string) => setForm(f => ({ ...f, [key]: val }))

  async function handleSave() {
    if (!form.client_id) { toast('اختر العميل', 'error'); return }
    setSaving(true)
    try {
      const res = await coreApi(
        'POST',
        '/obligations',
        { ...form, client_id: +form.client_id, due_day: +form.due_day },
        { queue: true, queueLabel: 'إضافة التزام ضريبي' },
      )
      if (res !== null) { toast('تم إنشاء الالتزام'); onSaved() }
    } catch (e: any) { toast(e.message || 'خطأ', 'error') }
    finally { setSaving(false) }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="إضافة التزام ضريبي"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>إلغاء</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'جاري الحفظ...' : 'إضافة'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="form-group">
          <label className="label">العميل *</label>
          <select className="input" value={form.client_id} onChange={e => set('client_id', e.target.value)}>
            <option value="">اختر العميل...</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="label">نوع الالتزام</label>
          <select className="input" value={form.obligation_type} onChange={e => set('obligation_type', e.target.value)}>
            {Object.entries(OBL_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="form-group">
            <label className="label">التكرار</label>
            <select className="input" value={form.frequency} onChange={e => set('frequency', e.target.value)}>
              {Object.entries(FREQ_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">يوم الاستحقاق</label>
            <input className="input" type="number" min={1} max={28} value={form.due_day} onChange={e => set('due_day', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="label">ملاحظات</label>
          <textarea className="input" rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      </div>
    </Modal>
  )
}
