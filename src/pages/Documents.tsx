import { useState, useEffect, useRef } from 'react'
import { Upload, Search, FileText, File, Image, Download, Trash2, FolderOpen } from 'lucide-react'
import api from '../api/client'
import type { Document, Client } from '../types'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { PageLoader } from '../components/ui/Spinner'
import { toast } from '../hooks/useToast'
import { formatDate, formatFileSize } from '../utils/format'

const CATEGORY_LABELS: Record<string, string> = {
  contract: 'عقود', invoice: 'فواتير', tax_return: 'إقرارات ضريبية',
  financial_statement: 'قوائم مالية', id_documents: 'وثائق هوية',
  commercial_register: 'سجل تجاري', bank_statement: 'كشف حساب',
  payroll: 'مرتبات', other: 'أخرى',
}

function FileIcon({ type }: { type?: string }) {
  const t = type?.toLowerCase()
  if (t === '.pdf') return <FileText className="w-8 h-8 text-red-400" />
  if (['.jpg', '.jpeg', '.png'].includes(t || '')) return <Image className="w-8 h-8 text-blue-400" />
  if (['.xlsx', '.xls', '.csv'].includes(t || '')) return <FileText className="w-8 h-8 text-green-400" />
  return <File className="w-8 h-8 text-gray-400" />
}

export default function Documents() {
  const [docs, setDocs] = useState<Document[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [deleting, setDeleting] = useState<Document | null>(null)

  async function load() {
    setLoading(true)
    try {
      const params: any = { page, page_size: 20 }
      if (search) params.q = search
      if (categoryFilter) params.category = categoryFilter
      const { data } = await api.get('/documents', { params })
      setDocs(data.items)
      setTotal(data.total)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [page, search, categoryFilter])

  async function handleDelete() {
    if (!deleting) return
    try {
      await api.delete(`/documents/${deleting.id}`)
      toast('تم حذف الملف')
      setDeleting(null)
      load()
    } catch (e: any) { toast(e.message, 'error') }
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h2 className="page-title">الأرشيف والمستندات</h2>
          <p className="page-subtitle">{total} ملف</p>
        </div>
        <button className="btn-primary" onClick={() => setShowUpload(true)}>
          <Upload className="w-4 h-4" /> رفع ملف
        </button>
      </div>

      <div className="card p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input className="input pr-9" placeholder="بحث في الملفات..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="input w-auto" value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1) }}>
          <option value="">كل التصنيفات</option>
          {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {loading ? <PageLoader /> : docs.length === 0 ? (
        <EmptyState icon={FolderOpen} title="لا توجد ملفات" description="ارفع ملفاتك ومستنداتك هنا" action={<button className="btn-primary btn-sm" onClick={() => setShowUpload(true)}><Upload className="w-3 h-3" />رفع ملف</button>} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {docs.map(doc => (
            <div key={doc.id} className="card p-4 flex flex-col gap-3 group hover:border-primary-200 border border-transparent transition-colors">
              <div className="flex items-start justify-between">
                <FileIcon type={doc.file_type} />
                <span className="badge-blue badge text-xs">{CATEGORY_LABELS[doc.category] || doc.category}</span>
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900 truncate">{doc.name}</div>
                {doc.client_name && <div className="text-xs text-gray-400 mt-0.5">{doc.client_name}</div>}
                <div className="text-xs text-gray-400 mt-1">{formatFileSize(doc.file_size)} · {formatDate(doc.created_at)}</div>
              </div>
              <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <a href={`/uploads/${(doc as any).file_path}`} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm flex-1 justify-center">
                  <Download className="w-3.5 h-3.5" /> تحميل
                </a>
                <button className="btn-ghost btn-sm p-1.5 text-red-500" onClick={() => setDeleting(doc)}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onSaved={() => { setShowUpload(false); load() }} />}
      <ConfirmDialog isOpen={!!deleting} onClose={() => setDeleting(null)} onConfirm={handleDelete} title="حذف الملف" message={`هل تريد حذف "${deleting?.name}"؟`} danger confirmLabel="حذف" />
    </div>
  )
}

function UploadModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [clients, setClients] = useState<Client[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({ client_id: '', category: 'other', description: '', year: new Date().getFullYear(), month: 0 })

  useEffect(() => {
    api.get('/clients', { params: { page_size: 200 } }).then(r => setClients(r.data.items))
  }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }

  async function handleUpload() {
    if (!file) { toast('اختر ملف أولًا', 'error'); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (form.client_id) fd.append('client_id', form.client_id)
      fd.append('category', form.category)
      if (form.description) fd.append('description', form.description)
      fd.append('year', String(form.year))
      if (form.month) fd.append('month', String(form.month))
      await api.post('/documents/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast('تم رفع الملف بنجاح')
      onSaved()
    } catch (e: any) { toast(e.message, 'error') }
    finally { setUploading(false) }
  }

  const MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']

  return (
    <Modal isOpen onClose={onClose} title="رفع ملف جديد" size="md"
      footer={<><button className="btn-secondary" onClick={onClose}>إلغاء</button><button className="btn-primary" onClick={handleUpload} disabled={uploading || !file}>{uploading ? 'جاري الرفع...' : 'رفع الملف'}</button></>}
    >
      <div className="space-y-4">
        {/* Drop Zone */}
        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" className="hidden" onChange={e => setFile(e.target.files?.[0] || null)}
            accept=".pdf,.jpg,.jpeg,.png,.xlsx,.xls,.docx,.doc,.csv" />
          {file ? (
            <div>
              <FileText className="w-10 h-10 text-primary-500 mx-auto mb-2" />
              <div className="font-medium text-gray-800">{file.name}</div>
              <div className="text-xs text-gray-400 mt-1">{formatFileSize(file.size)}</div>
            </div>
          ) : (
            <div>
              <Upload className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <div className="text-sm text-gray-500">اسحب الملف هنا أو انقر للاختيار</div>
              <div className="text-xs text-gray-400 mt-1">PDF, صور, Excel, Word</div>
            </div>
          )}
        </div>

        <div className="form-row grid-cols-2">
          <div className="form-group">
            <label className="label">العميل</label>
            <select className="input" value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}>
              <option value="">عام (بدون عميل)</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">التصنيف</label>
            <select className="input" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
              {Object.entries(CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">السنة</label>
            <input type="number" className="input" value={form.year} onChange={e => setForm(f => ({ ...f, year: +e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="label">الشهر</label>
            <select className="input" value={form.month} onChange={e => setForm(f => ({ ...f, month: +e.target.value }))}>
              <option value={0}>غير محدد</option>
              {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          </div>
        </div>
        <div className="form-group">
          <label className="label">الوصف</label>
          <input className="input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="وصف مختصر للملف" />
        </div>
      </div>
    </Modal>
  )
}
