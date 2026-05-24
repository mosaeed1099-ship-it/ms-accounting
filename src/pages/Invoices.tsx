import { useState, useEffect } from 'react'
import { Plus, Search, Eye, Trash2, DollarSign, FileText } from 'lucide-react'
import api from '../api/client'
import type { Invoice, Client } from '../types'
import { Modal } from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { PageLoader } from '../components/ui/Spinner'
import { toast } from '../hooks/useToast'
import { formatMoney, formatDate, invoiceStatusLabels } from '../utils/format'
import clsx from 'clsx'

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-gray', sent: 'badge-blue', paid: 'badge-green',
  partial: 'badge-yellow', overdue: 'badge-red', cancelled: 'badge-gray',
}

export default function Invoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<any>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null)
  const [showPayment, setShowPayment] = useState<Invoice | null>(null)

  async function load() {
    setLoading(true)
    try {
      const params: any = { page, page_size: 15 }
      if (search) params.q = search
      if (statusFilter) params.status = statusFilter
      const [inv, sum] = await Promise.all([
        api.get('/invoices', { params }),
        api.get('/invoices/summary'),
      ])
      setInvoices(inv.data.items)
      setTotal(inv.data.total)
      setSummary(sum.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [page, search, statusFilter])

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h2 className="page-title">الفواتير والمدفوعات</h2>
          <p className="page-subtitle">{total} فاتورة</p>
        </div>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <Plus className="w-4 h-4" /> فاتورة جديدة
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'إجمالي الفواتير', value: formatMoney(summary.total_revenue), color: 'text-gray-900' },
            { label: 'إجمالي المحصّل', value: formatMoney(summary.total_paid), color: 'text-green-600' },
            { label: 'المتبقي', value: formatMoney(summary.total_remaining), color: 'text-blue-600' },
            { label: 'المتأخرات', value: formatMoney(summary.total_overdue), color: 'text-red-600' },
          ].map(c => (
            <div key={c.label} className="card p-4">
              <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
              <div className="text-xs text-gray-400 mt-1">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pr-9" placeholder="بحث..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="input w-auto" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
          <option value="">كل الحالات</option>
          {Object.entries(invoiceStatusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="table-container">
        <table className="table">
          <thead>
            <tr>
              <th>رقم الفاتورة</th>
              <th>العميل</th>
              <th>الحالة</th>
              <th>تاريخ الإصدار</th>
              <th>الإجمالي</th>
              <th>المسدد</th>
              <th>المتبقي</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="py-16 text-center"><PageLoader /></td></tr>}
            {!loading && invoices.length === 0 && (
              <tr><td colSpan={8}><EmptyState icon={FileText} title="لا توجد فواتير" action={<button className="btn-primary btn-sm" onClick={() => setShowForm(true)}><Plus className="w-3 h-3" />إنشاء فاتورة</button>} /></td></tr>
            )}
            {invoices.map(inv => (
              <tr key={inv.id}>
                <td className="font-mono text-xs font-medium">{inv.invoice_number}</td>
                <td className="font-medium text-gray-900">{inv.client_name}</td>
                <td><span className={`badge ${STATUS_BADGE[inv.status]}`}>{invoiceStatusLabels[inv.status]}</span></td>
                <td className="text-sm text-gray-500">{formatDate(inv.issue_date)}</td>
                <td className="text-money font-semibold">{formatMoney(inv.total)}</td>
                <td className="text-money text-green-600">{formatMoney(inv.paid_amount)}</td>
                <td className={clsx('text-money font-medium', inv.remaining > 0 ? 'text-red-500' : 'text-gray-400')}>
                  {formatMoney(inv.remaining)}
                </td>
                <td>
                  <div className="flex gap-1">
                    <button className="btn-ghost btn-sm p-1.5" onClick={() => setViewInvoice(inv)} title="عرض"><Eye className="w-4 h-4" /></button>
                    {inv.remaining > 0 && inv.status !== 'cancelled' && (
                      <button className="btn-ghost btn-sm p-1.5 text-green-600" onClick={() => setShowPayment(inv)} title="تسجيل دفعة">
                        <DollarSign className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {total > 15 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">عرض {(page - 1) * 15 + 1}–{Math.min(page * 15, total)} من {total}</span>
          <div className="flex gap-2">
            <button className="btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>السابق</button>
            <button className="btn-secondary btn-sm" disabled={page * 15 >= total} onClick={() => setPage(p => p + 1)}>التالي</button>
          </div>
        </div>
      )}

      {showForm && <InvoiceFormModal onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
      {viewInvoice && <InvoiceViewModal invoice={viewInvoice} onClose={() => setViewInvoice(null)} />}
      {showPayment && <PaymentModal invoice={showPayment} onClose={() => setShowPayment(null)} onSaved={() => { setShowPayment(null); load() }} />}
    </div>
  )
}

// ──── Invoice Form ────
function InvoiceFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [clients, setClients] = useState<Client[]>([])
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    client_id: '', issue_date: new Date().toISOString().split('T')[0], due_date: '',
    tax_percent: 14, discount_percent: 0, stamp_tax: 0, withholding_tax: 0,
    description: '', notes: '',
  })
  const [items, setItems] = useState([{ description: '', quantity: 1, unit_price: 0, tax_percent: 0 }])

  useEffect(() => {
    api.get('/clients', { params: { page_size: 100 } }).then(r => setClients(r.data.items))
  }, [])

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0)
  const discountAmt = subtotal * (form.discount_percent / 100)
  const taxable = subtotal - discountAmt
  const taxAmt = taxable * (form.tax_percent / 100)
  const total = taxable + taxAmt + form.stamp_tax - form.withholding_tax

  const addItem = () => setItems(prev => [...prev, { description: '', quantity: 1, unit_price: 0, tax_percent: 0 }])
  const setItem = (i: number, k: string, v: any) => setItems(prev => prev.map((item, idx) => idx === i ? { ...item, [k]: v } : item))
  const removeItem = (i: number) => setItems(prev => prev.filter((_, idx) => idx !== i))

  async function handleSave() {
    if (!form.client_id) { toast('اختر العميل أولًا', 'error'); return }
    if (items.some(i => !i.description || i.unit_price <= 0)) { toast('تحقق من بنود الفاتورة', 'error'); return }
    setSaving(true)
    try {
      await api.post('/invoices', { ...form, client_id: +form.client_id, items })
      toast('تم إنشاء الفاتورة بنجاح')
      onSaved()
    } catch (e: any) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <Modal isOpen onClose={onClose} title="فاتورة جديدة" size="xl"
      footer={<><button className="btn-secondary" onClick={onClose}>إلغاء</button><button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'جاري الحفظ...' : 'إنشاء الفاتورة'}</button></>}
    >
      <div className="space-y-5">
        <div className="form-row grid-cols-1 md:grid-cols-3">
          <div className="form-group">
            <label className="label">العميل *</label>
            <select className="input" value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
              <option value="">اختر العميل</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">تاريخ الإصدار</label>
            <input type="date" className="input" value={form.issue_date} onChange={e => setForm(f => ({ ...f, issue_date: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="label">تاريخ الاستحقاق</label>
            <input type="date" className="input" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} />
          </div>
        </div>

        {/* Items */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="section-title mb-0">بنود الفاتورة</h4>
            <button className="btn-secondary btn-sm" onClick={addItem}><Plus className="w-3 h-3" /> بند</button>
          </div>
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-start p-3 bg-gray-50 rounded-lg">
                <div className="col-span-5">
                  <input className="input text-sm" placeholder="الوصف" value={item.description} onChange={e => setItem(i, 'description', e.target.value)} />
                </div>
                <div className="col-span-2">
                  <input className="input text-sm" type="number" placeholder="الكمية" value={item.quantity} onChange={e => setItem(i, 'quantity', +e.target.value)} min={1} />
                </div>
                <div className="col-span-2">
                  <input className="input text-sm" type="number" placeholder="السعر" value={item.unit_price} onChange={e => setItem(i, 'unit_price', +e.target.value)} />
                </div>
                <div className="col-span-2 flex items-center text-sm text-gray-700 font-medium">
                  {formatMoney(item.quantity * item.unit_price)}
                </div>
                <div className="col-span-1">
                  {items.length > 1 && (
                    <button className="btn-ghost btn-sm p-1 text-red-500" onClick={() => removeItem(i)}><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="form-row grid-cols-1 md:grid-cols-3">
          <div className="form-group">
            <label className="label">خصم (%)</label>
            <input type="number" className="input" value={form.discount_percent} onChange={e => setForm(f => ({ ...f, discount_percent: +e.target.value }))} min={0} max={100} />
          </div>
          <div className="form-group">
            <label className="label">ضريبة القيمة المضافة (%)</label>
            <input type="number" className="input" value={form.tax_percent} onChange={e => setForm(f => ({ ...f, tax_percent: +e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="label">ضريبة الدمغة</label>
            <input type="number" className="input" value={form.stamp_tax} onChange={e => setForm(f => ({ ...f, stamp_tax: +e.target.value }))} />
          </div>
        </div>

        {/* Summary */}
        <div className="p-4 bg-primary-50 rounded-xl border border-primary-100 space-y-2 text-sm">
          {[
            ['الإجمالي قبل الضريبة', formatMoney(subtotal)],
            [`خصم ${form.discount_percent}%`, `- ${formatMoney(discountAmt)}`],
            [`ضريبة ${form.tax_percent}%`, formatMoney(taxAmt)],
            ['ضريبة الدمغة', formatMoney(form.stamp_tax)],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between text-gray-600">
              <span>{k}</span><span>{v}</span>
            </div>
          ))}
          <div className="flex items-center justify-between font-bold text-base text-primary-700 pt-2 border-t border-primary-200">
            <span>الإجمالي النهائي</span><span>{formatMoney(total)}</span>
          </div>
        </div>

        <div className="form-group">
          <label className="label">ملاحظات</label>
          <textarea className="input" rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
        </div>
      </div>
    </Modal>
  )
}

// ──── Invoice View ────
function InvoiceViewModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  return (
    <Modal isOpen onClose={onClose} title={`فاتورة #${invoice.invoice_number}`} size="lg"
      footer={<button className="btn-secondary" onClick={onClose}>إغلاق</button>}
    >
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-4">
          <div><span className="text-gray-400">العميل:</span> <span className="font-medium">{invoice.client_name}</span></div>
          <div><span className="text-gray-400">الحالة:</span> <span className={`badge ${STATUS_BADGE[invoice.status]} mr-2`}>{invoiceStatusLabels[invoice.status]}</span></div>
          <div><span className="text-gray-400">تاريخ الإصدار:</span> <span>{formatDate(invoice.issue_date)}</span></div>
          <div><span className="text-gray-400">تاريخ الاستحقاق:</span> <span>{formatDate(invoice.due_date)}</span></div>
        </div>

        {/* Items Table */}
        <div className="table-container">
          <table className="table text-xs">
            <thead><tr><th>الوصف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
            <tbody>
              {invoice.items.map(item => (
                <tr key={item.id}><td>{item.description}</td><td>{item.quantity}</td><td>{formatMoney(item.unit_price)}</td><td>{formatMoney(item.total)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="p-3 bg-gray-50 rounded-lg space-y-1.5 text-sm">
          {[
            ['الإجمالي', formatMoney(invoice.subtotal)],
            [`خصم ${invoice.discount_percent}%`, `- ${formatMoney(invoice.discount_amount)}`],
            [`ضريبة ${invoice.tax_percent}%`, formatMoney(invoice.tax_amount)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between text-gray-600"><span>{k}</span><span>{v}</span></div>
          ))}
          <div className="flex justify-between font-bold text-base pt-2 border-t"><span>الإجمالي النهائي</span><span>{formatMoney(invoice.total)}</span></div>
          <div className="flex justify-between text-green-600"><span>المسدد</span><span>{formatMoney(invoice.paid_amount)}</span></div>
          <div className="flex justify-between text-red-500 font-medium"><span>المتبقي</span><span>{formatMoney(invoice.remaining)}</span></div>
        </div>

        {invoice.payments.length > 0 && (
          <div>
            <h4 className="font-medium text-gray-700 mb-2">سجل الدفعات</h4>
            <div className="space-y-1">
              {invoice.payments.map(p => (
                <div key={p.id} className="flex justify-between text-xs text-gray-600 p-2 bg-green-50 rounded">
                  <span>{formatDate(p.payment_date)}</span>
                  <span className="font-medium text-green-700">{formatMoney(p.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ──── Payment Modal ────
function PaymentModal({ invoice, onClose, onSaved }: { invoice: Invoice; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ amount: invoice.remaining, payment_date: new Date().toISOString().split('T')[0], payment_method: 'cash', reference: '', notes: '' })

  async function handleSave() {
    setSaving(true)
    try {
      await api.post('/invoices/payments', { ...form, invoice_id: invoice.id, amount: +form.amount })
      toast('تم تسجيل الدفعة بنجاح')
      onSaved()
    } catch (e: any) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  return (
    <Modal isOpen onClose={onClose} title={`تسجيل دفعة — ${invoice.invoice_number}`} size="sm"
      footer={<><button className="btn-secondary" onClick={onClose}>إلغاء</button><button className="btn-success" onClick={handleSave} disabled={saving}>{saving ? '...' : 'تسجيل الدفعة'}</button></>}
    >
      <div className="space-y-4 text-sm">
        <div className="p-3 bg-blue-50 rounded-lg text-blue-700">
          <span>المتبقي: </span><span className="font-bold">{formatMoney(invoice.remaining)}</span>
        </div>
        <div className="form-group">
          <label className="label">المبلغ المدفوع</label>
          <input type="number" className="input" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: +e.target.value }))} max={invoice.remaining} />
        </div>
        <div className="form-group">
          <label className="label">تاريخ الدفع</label>
          <input type="date" className="input" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="label">طريقة الدفع</label>
          <select className="input" value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}>
            <option value="cash">نقداً</option>
            <option value="bank_transfer">تحويل بنكي</option>
            <option value="check">شيك</option>
            <option value="instapay">إنستاباي</option>
            <option value="vodafone_cash">فودافون كاش</option>
          </select>
        </div>
        <div className="form-group">
          <label className="label">رقم المرجع / الشيك</label>
          <input className="input" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
        </div>
      </div>
    </Modal>
  )
}
