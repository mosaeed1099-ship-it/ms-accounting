import { useState, useEffect } from 'react'
import { Plus, Search, CheckCircle, Clock, AlertTriangle, Filter, Edit, Trash2 } from 'lucide-react'
import api from '../api/client'
import type { Task, Client } from '../types'
import { Modal } from '../components/ui/Modal'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { PageLoader } from '../components/ui/Spinner'
import { toast } from '../hooks/useToast'
import { taskStatusLabels, taskPriorityLabels, taskCategoryLabels, formatDate } from '../utils/format'
import clsx from 'clsx'

const STATUS_BADGE: Record<string, string> = {
  todo: 'badge-gray', in_progress: 'badge-blue', review: 'badge-yellow', done: 'badge-green', cancelled: 'badge-gray',
}
const PRIORITY_BADGE: Record<string, string> = {
  low: 'badge-gray', medium: 'badge-blue', high: 'badge-yellow', urgent: 'badge-red',
}

export default function Tasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('')
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list')
  const [board, setBoard] = useState<Record<string, Task[]>>({})
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [deleting, setDeleting] = useState<Task | null>(null)

  async function load() {
    setLoading(true)
    try {
      if (viewMode === 'board') {
        const { data } = await api.get('/tasks/board')
        setBoard(data)
      } else {
        const params: any = { page, page_size: 15 }
        if (search) params.q = search
        if (statusFilter) params.status = statusFilter
        if (priorityFilter) params.priority = priorityFilter
        const { data } = await api.get('/tasks', { params })
        setTasks(data.items)
        setTotal(data.total)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [page, search, statusFilter, priorityFilter, viewMode])

  async function handleDelete() {
    if (!deleting) return
    try {
      await api.delete(`/tasks/${deleting.id}`)
      toast('تم حذف المهمة')
      setDeleting(null)
      load()
    } catch (e: any) { toast(e.message, 'error') }
  }

  async function updateStatus(task: Task, status: string) {
    try {
      await api.put(`/tasks/${task.id}`, { status })
      load()
    } catch (e: any) { toast(e.message, 'error') }
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <h2 className="page-title">المهام</h2>
          <p className="page-subtitle">{total} مهمة</p>
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            <button onClick={() => setViewMode('list')} className={clsx('px-3 py-1.5 text-sm', viewMode === 'list' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}>قائمة</button>
            <button onClick={() => setViewMode('board')} className={clsx('px-3 py-1.5 text-sm', viewMode === 'board' ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50')}>لوحة</button>
          </div>
          <button className="btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
            <Plus className="w-4 h-4" /> مهمة جديدة
          </button>
        </div>
      </div>

      {/* Filters */}
      {viewMode === 'list' && (
        <div className="card p-4 flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input className="input pr-9" placeholder="بحث..." value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
          </div>
          <select className="input w-auto" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
            <option value="">كل الحالات</option>
            {Object.entries(taskStatusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="input w-auto" value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value); setPage(1) }}>
            <option value="">كل الأولويات</option>
            {Object.entries(taskPriorityLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      )}

      {/* Board View */}
      {viewMode === 'board' && !loading && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Object.entries(taskStatusLabels).map(([status, label]) => (
            <div key={status} className="flex-shrink-0 w-64">
              <div className="card">
                <div className="card-header py-3">
                  <span className={`badge ${STATUS_BADGE[status]}`}>{label}</span>
                  <span className="text-xs text-gray-400">{board[status]?.length || 0}</span>
                </div>
                <div className="p-2 space-y-2 min-h-32">
                  {(board[status] || []).map(task => (
                    <div key={task.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-primary-200 cursor-pointer group"
                      onClick={() => { setEditing(task); setShowForm(true) }}>
                      <div className="text-sm font-medium text-gray-800 mb-1.5">{task.title}</div>
                      {task.client_name && <div className="text-xs text-gray-400 mb-1">{task.client_name}</div>}
                      <div className="flex items-center gap-2">
                        <span className={`badge ${PRIORITY_BADGE[task.priority]} text-xs`}>{taskPriorityLabels[task.priority]}</span>
                        {task.due_date && <span className="text-xs text-gray-400">{formatDate(task.due_date)}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>العنوان</th>
                <th>العميل</th>
                <th>الحالة</th>
                <th>الأولوية</th>
                <th>التصنيف</th>
                <th>تاريخ التسليم</th>
                <th>المكلّف</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="py-16 text-center"><PageLoader /></td></tr>}
              {!loading && tasks.length === 0 && (
                <tr><td colSpan={8}><EmptyState icon={CheckCircle} title="لا توجد مهام" action={<button className="btn-primary btn-sm" onClick={() => setShowForm(true)}><Plus className="w-3 h-3" />مهمة جديدة</button>} /></td></tr>
              )}
              {tasks.map(task => (
                <tr key={task.id}>
                  <td>
                    <div className="font-medium text-gray-900">{task.title}</div>
                    {task.description && <div className="text-xs text-gray-400 truncate max-w-xs">{task.description}</div>}
                  </td>
                  <td className="text-sm text-gray-500">{task.client_name || '—'}</td>
                  <td><span className={`badge ${STATUS_BADGE[task.status]}`}>{taskStatusLabels[task.status]}</span></td>
                  <td><span className={`badge ${PRIORITY_BADGE[task.priority]}`}>{taskPriorityLabels[task.priority]}</span></td>
                  <td className="text-sm text-gray-500">{taskCategoryLabels[task.category]}</td>
                  <td className={clsx('text-sm', task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done' ? 'text-red-500 font-medium' : 'text-gray-500')}>
                    {formatDate(task.due_date)}
                  </td>
                  <td className="text-sm text-gray-500">{task.assigned_to_name || '—'}</td>
                  <td>
                    <div className="flex gap-1">
                      <button className="btn-ghost btn-sm p-1.5" onClick={() => { setEditing(task); setShowForm(true) }}><Edit className="w-4 h-4" /></button>
                      <button className="btn-ghost btn-sm p-1.5 text-red-500" onClick={() => setDeleting(task)}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'list' && total > 15 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">عرض {(page - 1) * 15 + 1}–{Math.min(page * 15, total)} من {total}</span>
          <div className="flex gap-2">
            <button className="btn-secondary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>السابق</button>
            <button className="btn-secondary btn-sm" disabled={page * 15 >= total} onClick={() => setPage(p => p + 1)}>التالي</button>
          </div>
        </div>
      )}

      {showForm && <TaskFormModal task={editing} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load() }} />}
      <ConfirmDialog isOpen={!!deleting} onClose={() => setDeleting(null)} onConfirm={handleDelete} title="حذف المهمة" message={`هل تريد حذف "${deleting?.title}"؟`} danger confirmLabel="حذف" />
    </div>
  )
}

function TaskFormModal({ task, onClose, onSaved }: { task: Task | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!task
  const [saving, setSaving] = useState(false)
  const [clients, setClients] = useState<Client[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    client_id: task?.client_id || '',
    status: task?.status || 'todo',
    priority: task?.priority || 'medium',
    category: task?.category || 'other',
    due_date: task?.due_date || '',
    estimated_hours: task?.estimated_hours || '',
    assigned_to: task?.assigned_to || '',
    tags: task?.tags || '',
  })

  useEffect(() => {
    Promise.all([
      api.get('/clients', { params: { page_size: 100 } }),
      api.get('/users'),
    ]).then(([c, u]) => { setClients(c.data.items); setUsers(u.data) })
  }, [])

  async function handleSave() {
    if (!form.title.trim()) { toast('العنوان مطلوب', 'error'); return }
    setSaving(true)
    try {
      const payload: any = { ...form }
      if (payload.client_id) payload.client_id = +payload.client_id
      if (payload.assigned_to) payload.assigned_to = +payload.assigned_to
      if (payload.estimated_hours) payload.estimated_hours = +payload.estimated_hours
      if (!payload.client_id) delete payload.client_id
      if (!payload.assigned_to) delete payload.assigned_to
      if (!payload.due_date) delete payload.due_date

      if (isEdit) {
        await api.put(`/tasks/${task!.id}`, payload)
        toast('تم تحديث المهمة')
      } else {
        await api.post('/tasks', payload)
        toast('تم إضافة المهمة')
      }
      onSaved()
    } catch (e: any) { toast(e.message, 'error') }
    finally { setSaving(false) }
  }

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  return (
    <Modal isOpen onClose={onClose} title={isEdit ? 'تعديل المهمة' : 'مهمة جديدة'} size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>إلغاء</button><button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? '...' : isEdit ? 'حفظ' : 'إضافة'}</button></>}
    >
      <div className="space-y-4">
        <div className="form-group">
          <label className="label">العنوان *</label>
          <input className="input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="عنوان المهمة" />
        </div>
        <div className="form-group">
          <label className="label">الوصف</label>
          <textarea className="input" rows={3} value={form.description} onChange={e => set('description', e.target.value)} />
        </div>
        <div className="form-row grid-cols-2">
          <div className="form-group">
            <label className="label">العميل</label>
            <select className="input" value={form.client_id} onChange={e => set('client_id', e.target.value)}>
              <option value="">بدون عميل</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">المكلّف</label>
            <select className="input" value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)}>
              <option value="">غير محدد</option>
              {users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">الأولوية</label>
            <select className="input" value={form.priority} onChange={e => set('priority', e.target.value)}>
              {Object.entries(taskPriorityLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">الحالة</label>
            <select className="input" value={form.status} onChange={e => set('status', e.target.value)}>
              {Object.entries(taskStatusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">التصنيف</label>
            <select className="input" value={form.category} onChange={e => set('category', e.target.value)}>
              {Object.entries(taskCategoryLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="label">تاريخ التسليم</label>
            <input type="date" className="input" value={form.due_date} onChange={e => set('due_date', e.target.value)} />
          </div>
        </div>
      </div>
    </Modal>
  )
}
