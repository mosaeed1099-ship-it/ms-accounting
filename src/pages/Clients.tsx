import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Edit, Eye, Phone, Building2, User } from 'lucide-react'
import { coreApi, EP, wsOn } from '../core'
import type { Client } from '../types'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { PageLoader } from '../components/ui/Spinner'
import { toast } from '../hooks/useToast'
import {
  clientStatusLabels, clientTypeLabels, formatDate, formatMoney, governorates,
} from '../utils/format'

const PAGE_SIZE = 15

const STATUS_BADGE: Record<string, string> = {
  active: 'badge-green', inactive: 'badge-gray', prospect: 'badge-blue', suspended: 'badge-red',
}

// ─── hook ─────────────────────────────────────────────────────────────────────

function useClients() {
  const [clients, setClients] = useState<Client[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const qs = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) })
    if (search) qs.set('q', search)
    if (statusFilter) qs.set('status', statusFilter)
    const res = await coreApi<{ items: Client[]; total: number }>('GET', `${EP.CLIENTS}?${qs}`)
    if (res) { setClients(res.items); setTotal(res.total) }
    setLoading(false)
  }, [page, search, statusFilter])

  // Initial + filter-driven load
  useEffect(() => { load() }, [load])

  // Real-time: refresh silently when another user touches clients
  useEffect(() => wsOn('clients_updated', () => load(true)), [load])

  function changeSearch(v: string) { setSearch(v); setPage(1) }
  function changeStatus(v: string) { setStatusFilter(v); setPage(1) }

  return { clients, total, page, setPage, search, changeSearch, statusFilter, changeStatus, loading, load }
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function Clients() {
  const {
    clients, total, page, setPage,
    search, changeSearch, statusFilter, changeStatus,
    loading, load,
  } = useClients()

  const [showForm, setShowForm] = useState(false)
  const [selected, setSelected] = useState<Client | null>(null)
  const [viewClient, setViewClient] = useState<Client | null>(null)

  function openAdd() { setSelected(null); setShowForm(true) }
  function openEdit(c: Client) { setSelected(c); setShowForm(true) }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h2 className="page-title">العملاء</h2>
          <p className="page-subtitle">{total} عميل مسجّل</p>
        </div>
        <button className="btn-primary" onClick={openAdd}>
          <Plus className="w-4 h-4" /> إضافة عميل
        </button>
      </div>

      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            className="input pr-9"
            placeholder="بحث بالاسم أو الرقم الضريبي أو الهاتف..."
            value={search}
            onChange={(e) => changeSearch(e.target.value)}
          />
        </div>
        <select className="input w-auto" value={statusFilter} onChange={(e) => changeStatus(e.target.value)}>
          <option value="">كل الحالات</option>
          {Object.entries(clientStatusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>الكود</th>
              <th>الاسم</th>
              <th>النوع</th>
              <th>الحالة</th>
              <th>الرقم الضريبي</th>
              <th>الهاتف</th>
              <th>قيمة العقد</th>
              <th>المحاسب</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={9} className="text-center py-16"><PageLoader /></td></tr>
            )}
            {!loading && clients.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <EmptyState
                    icon={User}
                    title="لا توجد عملاء"
                    description="ابدأ بإضافة أول عميل"
                    action={<button className="btn-primary btn-sm" onClick={openAdd}><Plus className="w-3 h-3" />إضافة عميل</button>}
                  />
                </td>
              </tr>
            )}
            {clients.map((c) => (
              <tr key={c.id}>
                <td className="font-mono text-xs text-gray-500">{c.code}</td>
                <td>
                  <div className="font-medium text-gray-900">{c.name}</div>
                  {c.email && <div className="text-xs text-gray-400">{c.email}</div>}
                </td>
                <td><span className="badge-blue badge">{clientTypeLabels[c.client_type]}</span></td>
                <td><span className={`badge ${STATUS_BADGE[c.status]}`}>{clientStatusLabels[c.status]}</span></td>
                <td className="font-mono text-sm">{c.tax_number || '—'}</td>
                <td className="text-sm">{c.phone || '—'}</td>
                <td className="text-money text-sm">{formatMoney(c.contract_value)}</td>
                <td className="text-sm text-gray-500">{c.assigned_accountant || '—'}</td>
                <td>
                  <div className="flex items-center gap-1">
                    <button className="btn-ghost btn-sm p-1.5" onClick={() => setViewClient(c)} title="عرض">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button className="btn-ghost btn-sm p-1.5" onClick={() => openEdit(c)} title="تعديل">
                      <Edit className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            عرض {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} من {total}
          </span>
          <div className="flex gap-2">
            <button className="btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>السابق</button>
            <button className="btn-secondary btn-sm" disabled={page * PAGE_SIZE >= total} onClick={() => setPage(p => p + 1)}>التالي</button>
          </div>
        </div>
      )}

      {showForm && (
        <ClientFormModal
          client={selected}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load() }}
        />
      )}

      {viewClient && (
        <ClientViewModal
          client={viewClient}
          onClose={() => setViewClient(null)}
          onEdit={() => { setSelected(viewClient); setViewClient(null); setShowForm(true) }}
        />
      )}
    </div>
  )
}

// ─── form modal ───────────────────────────────────────────────────────────────

function ClientFormModal({ client, onClose, onSaved }: {
  client: Client | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!client
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: client?.name ?? '',
    name_en: client?.name_en ?? '',
    client_type: client?.client_type ?? 'company',
    status: client?.status ?? 'active',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
    phone2: client?.phone2 ?? '',
    address: client?.address ?? '',
    governorate: client?.governorate ?? '',
    commercial_register: client?.commercial_register ?? '',
    tax_number: client?.tax_number ?? '',
    national_id: client?.national_id ?? '',
    activity: client?.activity ?? '',
    tax_type: client?.tax_type ?? 'vat',
    contract_value: client?.contract_value ?? 0,
    payment_terms: client?.payment_terms ?? 30,
    notes: client?.notes ?? '',
  })

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.name.trim()) { toast('اسم العميل مطلوب', 'error'); return }
    setSaving(true)
    try {
      if (isEdit) {
        // Pass updated_at as conflictTs → X-If-Unmodified-Since header injected automatically
        const res = await coreApi('PUT', EP.CLIENT(client!.id), form, {
          conflictTs: client!.updated_at ?? null,
          queue: true,
          queueLabel: 'تعديل بيانات عميل',
        })
        if (res !== null) { toast('تم تحديث بيانات العميل'); onSaved() }
      } else {
        const res = await coreApi('POST', EP.CLIENTS, form, {
          queue: true,
          queueLabel: 'إضافة عميل جديد',
        })
        if (res !== null) { toast('تم إضافة العميل بنجاح'); onSaved() }
      }
    } catch (e: any) {
      toast(e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={isEdit ? `تعديل: ${client!.name}` : 'إضافة عميل جديد'}
      size="xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>إلغاء</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'إضافة العميل'}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <h4 className="section-title"><Building2 className="w-4 h-4 text-primary-600" />البيانات الأساسية</h4>
          <div className="form-row grid-cols-1 md:grid-cols-2">
            <div className="form-group md:col-span-2">
              <label className="label">الاسم <span className="text-red-500">*</span></label>
              <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="اسم العميل أو الشركة" />
            </div>
            <div className="form-group">
              <label className="label">الاسم بالإنجليزية</label>
              <input className="input" value={form.name_en} onChange={e => set('name_en', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">نوع العميل</label>
              <select className="input" value={form.client_type} onChange={e => set('client_type', e.target.value)}>
                <option value="company">شركة</option>
                <option value="individual">فرد</option>
                <option value="freelancer">عمل حر</option>
              </select>
            </div>
            <div className="form-group">
              <label className="label">الحالة</label>
              <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
                {Object.entries(clientStatusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="label">نوع الضريبة</label>
              <select className="input" value={form.tax_type} onChange={e => set('tax_type', e.target.value)}>
                <option value="vat">ضريبة القيمة المضافة</option>
                <option value="income">ضريبة الدخل</option>
                <option value="withholding">خصم وإضافة</option>
                <option value="stamp">دمغة</option>
                <option value="none">لا يوجد</option>
              </select>
            </div>
          </div>
        </div>

        <div>
          <h4 className="section-title"><Phone className="w-4 h-4 text-primary-600" />بيانات التواصل</h4>
          <div className="form-row grid-cols-1 md:grid-cols-2">
            <div className="form-group">
              <label className="label">الهاتف</label>
              <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="01xxxxxxxxx" />
            </div>
            <div className="form-group">
              <label className="label">هاتف بديل</label>
              <input className="input" value={form.phone2} onChange={e => set('phone2', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">البريد الإلكتروني</label>
              <input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">المحافظة</label>
              <select className="input" value={form.governorate} onChange={e => set('governorate', e.target.value)}>
                <option value="">اختر المحافظة</option>
                {governorates.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="form-group md:col-span-2">
              <label className="label">العنوان</label>
              <textarea className="input" rows={2} value={form.address} onChange={e => set('address', e.target.value)} />
            </div>
          </div>
        </div>

        <div>
          <h4 className="section-title"><Building2 className="w-4 h-4 text-primary-600" />البيانات التجارية والضريبية</h4>
          <div className="form-row grid-cols-1 md:grid-cols-2">
            <div className="form-group">
              <label className="label">الرقم الضريبي</label>
              <input className="input" value={form.tax_number} onChange={e => set('tax_number', e.target.value)} placeholder="000-000-000" />
            </div>
            <div className="form-group">
              <label className="label">السجل التجاري</label>
              <input className="input" value={form.commercial_register} onChange={e => set('commercial_register', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">الرقم القومي</label>
              <input className="input" value={form.national_id} onChange={e => set('national_id', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">النشاط التجاري</label>
              <input className="input" value={form.activity} onChange={e => set('activity', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">قيمة العقد (جنيه)</label>
              <input className="input" type="number" value={form.contract_value} onChange={e => set('contract_value', +e.target.value)} />
            </div>
            <div className="form-group">
              <label className="label">شروط الدفع (يوم)</label>
              <input className="input" type="number" value={form.payment_terms} onChange={e => set('payment_terms', +e.target.value)} />
            </div>
          </div>
        </div>

        <div className="form-group">
          <label className="label">ملاحظات</label>
          <textarea className="input" rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="أي ملاحظات خاصة بالعميل..." />
        </div>
      </div>
    </Modal>
  )
}

// ─── view modal ───────────────────────────────────────────────────────────────

function ClientViewModal({ client, onClose, onEdit }: {
  client: Client
  onClose: () => void
  onEdit: () => void
}) {
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={client.name}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>إغلاق</button>
          <button className="btn-primary" onClick={onEdit}><Edit className="w-4 h-4" />تعديل</button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
        {([
          ['الكود', client.code],
          ['النوع', clientTypeLabels[client.client_type]],
          ['الحالة', clientStatusLabels[client.status]],
          ['الرقم الضريبي', client.tax_number],
          ['السجل التجاري', client.commercial_register],
          ['الرقم القومي', client.national_id],
          ['الهاتف', client.phone],
          ['هاتف بديل', client.phone2],
          ['البريد الإلكتروني', client.email],
          ['المحافظة', client.governorate],
          ['قيمة العقد', formatMoney(client.contract_value)],
          ['نوع الضريبة', client.tax_type],
          ['النشاط', client.activity],
          ['المحاسب المسؤول', client.assigned_accountant],
          ['تاريخ الإنشاء', formatDate(client.created_at)],
        ] as [string, string | undefined][]).map(([k, v]) => v ? (
          <div key={k}>
            <span className="text-gray-400">{k}:</span>
            <span className="font-medium text-gray-800 mr-2">{v}</span>
          </div>
        ) : null)}
        {client.address && (
          <div className="col-span-2">
            <span className="text-gray-400">العنوان:</span>
            <span className="font-medium text-gray-800 mr-2">{client.address}</span>
          </div>
        )}
        {client.notes && (
          <div className="col-span-2 p-3 bg-yellow-50 rounded-lg border border-yellow-100">
            <span className="text-gray-400 text-xs block mb-1">ملاحظات:</span>
            <span className="text-gray-700 text-sm">{client.notes}</span>
          </div>
        )}
      </div>
    </Modal>
  )
}
