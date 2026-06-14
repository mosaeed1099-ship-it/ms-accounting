import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, FileText, CheckSquare, Calculator, TrendingUp, AlertCircle,
  Banknote, ArrowUpRight, UserPlus, RefreshCw,
  BarChart2, AlertTriangle, Zap,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts'
import api from '../api/client'
import type { DashboardStats } from '../types'
import { useAuthStore } from '../store/authStore'
import { PageLoader } from '../components/ui/Spinner'
import { formatMoney, formatDate } from '../utils/format'

const API_BASE = import.meta.env.PROD
  ? (import.meta.env.VITE_API_URL || 'https://ms-accounting-api-production.up.railway.app')
  : 'http://localhost:8000'

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000)
}

function urgencyClass(days: number) {
  if (days <= 1) return 'text-red-600 bg-red-50'
  if (days <= 3) return 'text-orange-600 bg-orange-50'
  return 'text-gray-500 bg-gray-50'
}

function KpiCard({
  label, value, sub, icon: Icon, color, badge, onClick,
}: {
  label: string
  value: string | number
  sub: string
  icon: React.ElementType
  color: string
  badge?: string
  onClick?: () => void
}) {
  return (
    <div
      className={`card p-4 flex flex-col gap-3 ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
      onClick={onClick}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <div className="text-xl font-bold text-gray-900">{value}</div>
          {badge && (
            <span className="text-xs font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
              {badge}
            </span>
          )}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">{label}</div>
        <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
      </div>
    </div>
  )
}

function QuickActions({ role }: { role: string }) {
  const navigate = useNavigate()
  const actions = [
    { label: 'عميل جديد', icon: UserPlus, to: 'clients', color: 'bg-blue-600 hover:bg-blue-700', roles: ['admin', 'manager', 'accountant'] },
    { label: 'فاتورة جديدة', icon: FileText, to: 'invoices', color: 'bg-green-600 hover:bg-green-700', roles: ['admin', 'manager', 'accountant'] },
    { label: 'مهمة جديدة', icon: CheckSquare, to: 'tasks', color: 'bg-orange-500 hover:bg-orange-600', roles: ['admin', 'manager', 'accountant'] },
    { label: 'إقرار ضريبي', icon: Calculator, to: 'tax', color: 'bg-purple-600 hover:bg-purple-700', roles: ['admin', 'manager', 'accountant'] },
    { label: 'التقارير', icon: BarChart2, to: 'reports', color: 'bg-teal-600 hover:bg-teal-700', roles: ['admin', 'manager'] },
    { label: 'عملاء محتملون', icon: Zap, to: 'leads', color: 'bg-yellow-500 hover:bg-yellow-600', roles: ['admin', 'manager'] },
  ].filter((a) => a.roles.includes(role))

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="font-bold text-gray-900">إجراءات سريعة</h3>
      </div>
      <div className="p-4 grid grid-cols-2 gap-2">
        {actions.map((a) => (
          <button
            key={a.to}
            onClick={() => navigate(`/${a.to}`)}
            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-white text-sm font-medium transition-colors ${a.color}`}
          >
            <a.icon className="w-4 h-4 flex-shrink-0" />
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function AdminWidget({ stats }: { stats: DashboardStats }) {
  const pieData = [
    { name: 'إقرار الدخل', value: stats.clients.income_declaration, color: '#2563eb' },
    { name: 'ضريبة القيمة المضافة', value: stats.clients.vat_declaration, color: '#7c3aed' },
    { name: 'كشف الرواتب', value: stats.clients.payroll_declaration, color: '#059669' },
  ].filter((d) => d.value > 0)

  const collectionRate = stats.financial.total_invoiced > 0
    ? Math.round((stats.financial.total_collected / stats.financial.total_invoiced) * 100)
    : 0

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="font-bold text-gray-900">توزيع العملاء بالإلتزامات</h3>
        <span className="badge badge-blue text-xs">{stats.clients.total} عميل</span>
      </div>
      <div className="p-4">
        {pieData.length > 0 ? (
          <div className="flex items-center gap-4">
            <div className="w-28 h-28 flex-shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={28} outerRadius={52} strokeWidth={2}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 space-y-2">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                    <span className="text-gray-600">{d.name}</span>
                  </div>
                  <span className="font-semibold text-gray-900">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-gray-400 text-sm">لا توجد بيانات</div>
        )}
        <div className="mt-4 pt-3 border-t border-gray-100">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-gray-500">نسبة التحصيل الإجمالية</span>
            <span className="font-bold text-gray-900">{collectionRate}%</span>
          </div>
          <div className="bg-gray-100 rounded-full h-2">
            <div
              className="h-2 rounded-full bg-green-500 transition-all"
              style={{ width: `${Math.min(collectionRate, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function ManagerWidget({ stats }: { stats: DashboardStats }) {
  const maxVal = Math.max(stats.tasks.pending, 1)
  const overduePercent = stats.tasks.pending > 0
    ? Math.round(((stats.tasks.overdue ?? 0) / stats.tasks.pending) * 100)
    : 0

  return (
    <div className="card">
      <div className="card-header">
        <h3 className="font-bold text-gray-900">متابعة الفريق</h3>
      </div>
      <div className="p-4 space-y-3">
        {[
          { label: 'مهام معلقة', value: stats.tasks.pending, color: 'bg-blue-500' },
          { label: 'مهام متأخرة', value: stats.tasks.overdue ?? 0, color: 'bg-red-500' },
          { label: 'مهام عاجلة', value: stats.tasks.urgent ?? 0, color: 'bg-orange-500' },
        ].map((item) => (
          <div key={item.label}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-600">{item.label}</span>
              <span className="font-semibold text-gray-900">{item.value}</span>
            </div>
            <div className="bg-gray-100 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full ${item.color} transition-all`}
                style={{ width: `${Math.min((item.value / maxVal) * 100, 100)}%` }}
              />
            </div>
          </div>
        ))}
        <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <span>نسبة التأخر عن الإجمالي</span>
          <span className={overduePercent > 30 ? 'text-red-500 font-medium' : ''}>{overduePercent}%</span>
        </div>
      </div>
    </div>
  )
}

function AccountantWidget({ stats }: { stats: DashboardStats }) {
  return (
    <div className="card">
      <div className="card-header">
        <h3 className="font-bold text-gray-900">الوضع الضريبي</h3>
      </div>
      <div className="p-4 space-y-3">
        <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0" />
          <div>
            <div className="text-sm font-semibold text-gray-800">{stats.tax.pending} إقرار معلق</div>
            <div className="text-xs text-gray-500">قيد المعالجة أو لم يبدأ بعد</div>
          </div>
        </div>
        {(stats.tax.late ?? 0) > 0 && (
          <div className="flex items-center gap-3 p-3 bg-red-50 rounded-xl">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div>
              <div className="text-sm font-semibold text-gray-800">{stats.tax.late} إقرار متأخر</div>
              <div className="text-xs text-red-400">يستوجب اتخاذ إجراء فوري</div>
            </div>
          </div>
        )}
        <div className="pt-2 border-t border-gray-100 grid grid-cols-2 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-gray-900">{stats.clients.vat_declaration}</div>
            <div className="text-xs text-gray-400">عميل ضريبة قيمة مضافة</div>
          </div>
          <div>
            <div className="text-lg font-bold text-gray-900">{stats.clients.income_declaration}</div>
            <div className="text-xs text-gray-400">عميل إقرار دخل</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [chartData, setChartData] = useState<any[]>([])
  const [deadlines, setDeadlines] = useState<any>({ tasks: [], tax_returns: [] })
  const [activity, setActivity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      const [s, c, d, a] = await Promise.all([
        api.get('/dashboard/stats'),
        api.get('/dashboard/revenue-chart'),
        api.get('/dashboard/upcoming-deadlines?days=14'),
        api.get('/dashboard/recent-activity?limit=15'),
      ])
      setStats(s.data)
      setChartData(c.data)
      setDeadlines(d.data)
      setActivity(a.data)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    const wsUrl = `${API_BASE.replace('https://', 'wss://').replace('http://', 'ws://')}/ws?token=${token}`
    const ws = new WebSocket(wsUrl)
    wsRef.current = ws
    const TRIGGER = new Set(['clients', 'invoices', 'tasks', 'collections', 'obligations'])
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.entity && TRIGGER.has(msg.entity)) load(true)
      } catch {}
    }
    ws.onerror = () => {}
    return () => { ws.close() }
  }, [load])

  if (loading) return <PageLoader />

  const role = user?.role ?? 'viewer'

  const kpiCards = [
    {
      label: 'إجمالي العملاء',
      value: stats?.clients.total ?? 0,
      sub: `${stats?.clients.active ?? 0} نشط · ${stats?.clients.new_this_month ?? 0} جديد هذا الشهر`,
      icon: Users,
      color: 'bg-blue-50 text-blue-600',
      badge: stats?.clients.new_this_month ? `+${stats.clients.new_this_month}` : undefined,
      onClick: () => navigate('/clients'),
    },
    {
      label: 'الإيرادات الشهرية',
      value: formatMoney(stats?.financial.monthly_revenue ?? 0),
      sub: `المتبقي: ${formatMoney(stats?.financial.total_outstanding ?? 0)}`,
      icon: Banknote,
      color: 'bg-green-50 text-green-600',
      onClick: () => navigate('/invoices'),
    },
    {
      label: 'المتأخرات',
      value: formatMoney(stats?.financial.total_overdue ?? 0),
      sub: 'فواتير متأخرة السداد',
      icon: AlertCircle,
      color: 'bg-red-50 text-red-600',
      onClick: () => navigate('/invoices'),
    },
    {
      label: 'المهام المعلقة',
      value: stats?.tasks.pending ?? 0,
      sub: `${stats?.tasks.overdue ?? 0} متأخر · ${stats?.tasks.urgent ?? 0} عاجل`,
      icon: CheckSquare,
      color: 'bg-orange-50 text-orange-600',
      onClick: () => navigate('/tasks'),
    },
    {
      label: 'الإقرارات الضريبية',
      value: stats?.tax.pending ?? 0,
      sub: `${stats?.tax.late ?? 0} متأخر`,
      icon: Calculator,
      color: 'bg-purple-50 text-purple-600',
      onClick: () => navigate('/tax'),
    },
    {
      label: 'إجمالي المحصّل',
      value: formatMoney(stats?.financial.total_collected ?? 0),
      sub: `من إجمالي ${formatMoney(stats?.financial.total_invoiced ?? 0)}`,
      icon: TrendingUp,
      color: 'bg-teal-50 text-teal-600',
      onClick: () => navigate('/reports'),
    },
  ]

  const allDeadlines = [
    ...deadlines.tasks.map((t: any) => ({ ...t, _type: 'task' })),
    ...deadlines.tax_returns.map((r: any) => ({
      ...r,
      _type: 'tax',
      title: r.return_type_label || r.return_type,
    })),
  ].sort((a, b) => (a.due_date > b.due_date ? 1 : -1))

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">لوحة التحكم</h2>
          <p className="text-sm text-gray-400 mt-0.5">مرحباً {user?.name}</p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          تحديث
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiCards.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="card xl:col-span-2">
          <div className="card-header">
            <div>
              <h3 className="font-bold text-gray-900">الإيرادات والفواتير</h3>
              <p className="text-xs text-gray-400">آخر 6 أشهر</p>
            </div>
            <button onClick={() => navigate('/reports')} className="flex items-center gap-1 text-xs text-primary-600 hover:underline">
              عرض التقارير <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="p-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gInvoiced" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => formatMoney(v)} />
                <Legend />
                <Area type="monotone" dataKey="revenue" name="محصّل" stroke="#2563eb" fill="url(#gRevenue)" strokeWidth={2} />
                <Area type="monotone" dataKey="invoiced" name="مفوتر" stroke="#16a34a" fill="url(#gInvoiced)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="font-bold text-gray-900">المواعيد القادمة</h3>
            <span className="badge badge-yellow text-xs">{allDeadlines.length}</span>
          </div>
          <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
            {allDeadlines.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
                لا توجد مواعيد خلال 14 يوماً
              </div>
            ) : (
              allDeadlines.slice(0, 10).map((item, i) => {
                const days = daysUntil(item.due_date)
                return (
                  <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                    <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${item._type === 'tax' ? 'bg-purple-400' : 'bg-blue-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-800 truncate">{item.title}</div>
                      {item.client_name && <div className="text-xs text-gray-400 truncate">{item.client_name}</div>}
                    </div>
                    <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${urgencyClass(days)}`}>
                      {days === 0 ? 'اليوم' : days < 0 ? `${Math.abs(days)}د متأخر` : `${days}د`}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {stats && (
          role === 'admin' ? <AdminWidget stats={stats} /> :
          role === 'manager' ? <ManagerWidget stats={stats} /> :
          <AccountantWidget stats={stats} />
        )}

        {role !== 'viewer' && <QuickActions role={role} />}

        <div className={`card ${role === 'viewer' ? 'xl:col-span-3' : ''}`}>
          <div className="card-header">
            <h3 className="font-bold text-gray-900">آخر الأنشطة</h3>
          </div>
          <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
            {activity.length === 0 ? (
              <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
                لا توجد أنشطة بعد
              </div>
            ) : (
              activity.map((log) => (
                <div key={log.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xs font-bold flex-shrink-0">
                    {log.user?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-800 truncate">{log.description}</div>
                    <div className="text-xs text-gray-400">{log.user}</div>
                  </div>
                  <div className="text-xs text-gray-400 flex-shrink-0 whitespace-nowrap">{formatDate(log.created_at)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
