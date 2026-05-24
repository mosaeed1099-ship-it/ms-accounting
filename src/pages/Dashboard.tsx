import { useEffect, useState } from 'react'
import {
  Users, FileText, CheckSquare, Calculator, TrendingUp, AlertCircle,
  Clock, ArrowUpRight, Banknote, AlertTriangle,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend,
} from 'recharts'
import api from '../api/client'
import type { DashboardStats } from '../types'
import { PageLoader } from '../components/ui/Spinner'
import { formatMoney, formatDate } from '../utils/format'

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [chartData, setChartData] = useState<any[]>([])
  const [deadlines, setDeadlines] = useState<any>({ tasks: [], tax_returns: [] })
  const [activity, setActivity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [s, c, d, a] = await Promise.all([
          api.get('/dashboard/stats'),
          api.get('/dashboard/revenue-chart'),
          api.get('/dashboard/upcoming-deadlines'),
          api.get('/dashboard/recent-activity'),
        ])
        setStats(s.data)
        setChartData(c.data)
        setDeadlines(d.data)
        setActivity(a.data)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) return <PageLoader />

  const statCards = [
    {
      label: 'إجمالي العملاء',
      value: stats?.clients.total ?? 0,
      sub: `${stats?.clients.active ?? 0} نشط · ${stats?.clients.new_this_month ?? 0} جديد هذا الشهر`,
      icon: Users,
      color: 'bg-blue-50 text-blue-600',
      trend: '+' + (stats?.clients.new_this_month ?? 0),
    },
    {
      label: 'الإيرادات الشهرية',
      value: formatMoney(stats?.financial.monthly_revenue ?? 0),
      sub: `المتبقي: ${formatMoney(stats?.financial.total_outstanding ?? 0)}`,
      icon: Banknote,
      color: 'bg-green-50 text-green-600',
    },
    {
      label: 'المتأخرات',
      value: formatMoney(stats?.financial.total_overdue ?? 0),
      sub: 'فواتير متأخرة السداد',
      icon: AlertCircle,
      color: 'bg-red-50 text-red-600',
    },
    {
      label: 'المهام المعلقة',
      value: stats?.tasks.pending ?? 0,
      sub: `${stats?.tasks.overdue ?? 0} متأخر · ${stats?.tasks.urgent ?? 0} عاجل`,
      icon: CheckSquare,
      color: 'bg-orange-50 text-orange-600',
    },
    {
      label: 'الإقرارات الضريبية',
      value: stats?.tax.pending ?? 0,
      sub: `${stats?.tax.late ?? 0} متأخر`,
      icon: Calculator,
      color: 'bg-purple-50 text-purple-600',
    },
    {
      label: 'إجمالي المحصّل',
      value: formatMoney(stats?.financial.total_collected ?? 0),
      sub: `من إجمالي ${formatMoney(stats?.financial.total_invoiced ?? 0)}`,
      icon: TrendingUp,
      color: 'bg-teal-50 text-teal-600',
    },
  ]

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="card p-4 flex flex-col gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${card.color}`}>
              <card.icon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xl font-bold text-gray-900">{card.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{card.label}</div>
              <div className="text-xs text-gray-400 mt-0.5">{card.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <div className="card xl:col-span-2">
          <div className="card-header">
            <div>
              <h3 className="font-bold text-gray-900">الإيرادات والفواتير</h3>
              <p className="text-xs text-gray-400">آخر 6 أشهر</p>
            </div>
          </div>
          <div className="p-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="invoiced" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#16a34a" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => formatMoney(v)} />
                <Legend />
                <Area type="monotone" dataKey="revenue" name="محصّل" stroke="#2563eb" fill="url(#revenue)" strokeWidth={2} />
                <Area type="monotone" dataKey="invoiced" name="مفوتر" stroke="#16a34a" fill="url(#invoiced)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Upcoming Deadlines */}
        <div className="card">
          <div className="card-header">
            <h3 className="font-bold text-gray-900">المواعيد القادمة</h3>
            <span className="badge-yellow badge text-xs">{deadlines.tasks.length + deadlines.tax_returns.length}</span>
          </div>
          <div className="divide-y divide-gray-50 max-h-56 overflow-y-auto">
            {[...deadlines.tasks.map((t: any) => ({ ...t, _type: 'task' })),
              ...deadlines.tax_returns.map((r: any) => ({ ...r, _type: 'tax', title: r.return_type_label || r.return_type }))]
              .sort((a, b) => (a.due_date > b.due_date ? 1 : -1))
              .slice(0, 8)
              .map((item, i) => (
                <div key={i} className="flex items-start gap-3 px-4 py-3">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${item._type === 'tax' ? 'bg-purple-400' : 'bg-blue-400'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-800 truncate">{item.title}</div>
                    {item.client_name && <div className="text-xs text-gray-400">{item.client_name}</div>}
                  </div>
                  <div className="text-xs text-gray-400 flex-shrink-0">{formatDate(item.due_date)}</div>
                </div>
              ))}
            {deadlines.tasks.length === 0 && deadlines.tax_returns.length === 0 && (
              <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
                لا توجد مواعيد قادمة
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-bold text-gray-900">آخر الأنشطة</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {activity.length === 0 && (
            <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
              لا توجد أنشطة بعد
            </div>
          )}
          {activity.slice(0, 10).map((log) => (
            <div key={log.id} className="flex items-center gap-4 px-6 py-3">
              <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 text-xs font-bold flex-shrink-0">
                {log.user?.charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-800">{log.description}</div>
                <div className="text-xs text-gray-400">{log.user}</div>
              </div>
              <div className="text-xs text-gray-400 flex-shrink-0">{formatDate(log.created_at)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
