import { useState, useEffect } from 'react'
import { Plus, Search, Calendar, Edit } from 'lucide-react'
import api from '../api/client'
import type { TaxReturn, Client } from '../types'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { PageLoader } from '../components/ui/Spinner'
import { toast } from '../hooks/useToast'
import { formatDate, formatMoney } from '../utils/format'

const STATUS_LABELS: Record<string, string> = {
  pending: 'معلق', in_progress: 'جاري', submitted: 'مقدّم',
  approved: 'معتمد', rejected: 'مرفوض', late: 'متأخر',
}
const STATUS_BADGE: Record<string, string> = {
  pending: 'badge-gray', in_progress: 'badge-blue', submitted: 'badge-green',
  approved: 'badge-green', rejected: 'badge-red', late: 'badge-red',
}
const TYPE_LABELS: Record<string, string> = {
  vat_monthly: 'قيمة مضافة شهري',
  vat_quarterly: 'قيمة مضافة ربعي',
  income_annual: 'ضريبة دخل سنوي',
  withholding: 'خصم وإضافة',
  stamp_tax: 'ضريبة دمغة',
  salary_tax: 'ضريبة مرتبات',
}

export default function Tax() {
  const [items, setItems] = useState<TaxReturn[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear())
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<TaxReturn | null>(null)

  async function load() {
    setLoading(true)
    try {
      const params: any = { page, page_size: 15, year: yearFilter }
      if (statusFilter) params.status = statusFilter
      const { data } = await api.get('/tax', { params })
      setItems(data.items)
      setTotal(data.total)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, statusFilter, yearFilter])

  const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h2 className="page-title">الإقرارات الضريبية</h2>
          <p className="page-subtitle">{total} إقرار</p>
        </div>
        <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
          <Plus className="w-4 h-4" /> إقرار جديد
        </button>
      </div>

      <div className="card p-4 flex flex-wrap gap-3">
        <select className="input w-auto" value={yearFilter} onChange={e => { setYearFilter(+e.target.value); setPage(1) }}>
          {[2022, 2023, 2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select className="input w-auto" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">كل الحالات</option>
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr><th>العميل</th><th>نوع الإقرار</th><th>السنة / الشهر</th><th>الحالة</th><th>تاريخ الاستحقاق</th><th>مبلغ الضريبة</th><th>الغرامة</th><th></th></tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="py-16 text-center"><PageLoader /></td></tr>}
            {!loading && items.length === 0 && (
              <tr><td colSpan={8}><EmptyState icon={Calendar} title="لا توجد إقرارات ضريبية" action={<button className="btn-primary btn-sm" onClick={() => setShowForm(true)}><Plus className="w-3 h-3" />إضافة إقرار</button>} /></td></tr>
            )}
            {items.map(r => (
              <tr key={r.id}>
                <td className="font-medium text-gray-900">{r.client_name}</td>
                <td><span className="badge-purple badge text-xs">{TYPE_LABELS[r.return_type] || r.return_type}</span></td>
                <td className="text-sm text-gray-500">{r.period_year} / {r.period_month ? MONTHS[r.period_month - 1] : `ربع ${r.period_quarter || '—'}`}</td>
                <td><span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABELS[r.status]}</span></td>
                <td className="text-sm text-gray-500">{formatDate(r.due_date)}</td>
                <td className="text-money text-sm">{formatMoney(r.tax_amount)}</td>
                <td className="text-money text-sm text-red-500">{r.penalty > 0 ? formatMoney(r.penalty) : '—'}</td>
                <td>
                  <button className="btn-ghost btn-sm p-1.5" onClick={() => { setEditing(r); setShowForm(true) }}>
                    <Edit className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showForm && <TaxReturnFormModal taxReturn={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
    </div>
  )
}

function TaxReturnFormModal({ taxReturn, onClose, onSaved }: { taxReturn: TaxReturn | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!taxReturn
  const [saving, setSaving] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [form, setForm] = useState({
    client_id: taxReturn?.client_id || '',
    return_type: taxReturn?.return_type || 'vat_monthly',
    period_year: taxReturn?.period_year || new Date().getFullYear(),
    period_month: taxReturn?.period_month || new Date().getMonth() + 1,
    due_date: taxReturn?.due_date || '',
    tax_amount: taxReturn?.tax_amount || 0,
    status: taxReturn?.status || 'pending',
    penalty: taxReturn?.penalty || 0,
    reference_number: taxReturn?.reference_number || '',
    notes: taxReturn?.notes || '',
  })

  useEffect(() => {
    api.get('/clients', { params: { page_size: 200 } }).then(r => setClients(r.data.items))
  }, [])

  async function handleSave() {
    if (!form.client_id) { toast('اختر العميل', 'error'); return }
    setSaving(true)
    try {
      const payload: any = { ...form, client_id: +form.client_id }
      if (isEdit) {
        await api.put(`/tax/${taxReturn!.id}`, payload)
        toast('تم تحديث الإقرار')
      } else {
        await api.post('/tax', payload)
        toast('تم إضافة الإقرار')
      }
      onSaved()
    } catch (e: any) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))
  const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'تعديل الإقرار' : 'إقرار ضريبي جديد'} size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>إلغاء</button><button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? '...' : isEdit ? 'حفظ' : 'إضافة'}</button></>}
    >
      <div className="space-y-4">
        <div className="form-row grid-cols-1 md:grid-cols-2">
          <div className="form-group md:col-span-2">
            <label className="label">العميل *</label>
            <select className="input" value={form.client_id} onChange={e => set('client_id', e.target.value)}>
              <option value="">اختر العميل</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">نوع الإقرار</label>
            <select className="input" value={form.return_type} onChange={e => set('return_type', e.target.value)}>
              {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">الحالة</label>
            <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
              {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">السنة</label>
            <input type="number" className="input" value={form.period_year} onChange={e => set('period_year', +e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">الشهر</label>
            <select className="input" value={form.period_month} onChange={e => set('period_month', +e.target.value)}>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">تاريخ الاستحقاق</label>
            <input type="date" className="input" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">مبلغ الضريبة</label>
            <input type="number" className="input" value={form.tax_amount} onChange={e => set('tax_amount', +e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">الغرامة</label>
            <input type="number" className="input" value={form.penalty} onChange={e => set('penalty', +e.target.value)} />
          </div>
          <div className="form-group">
            <label className="label">رقم المرجع</label>
            <input className="input" value={form.reference_number} onChange={e => set('reference_number', e.target.value)} />
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
