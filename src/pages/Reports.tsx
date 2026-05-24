import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import api from '../api/client'
import { formatMoney } from '../utils/format'
import { PageLoader } from '../components/ui/Spinner'

const COLORS = ['#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#0891b2']

export default function Reports() {
  const [revenueData, setRevenueData] = useState<any[]>([])
  const [clientStats, setClientStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [months, setMonths] = useState(6)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [rev, clients] = await Promise.all([
          api.get(`/dashboard/revenue-chart?months=${months}`),
          api.get('/clients/stats'),
        ])
        setRevenueData(rev.data)
        setClientStats(clients.data)
      } finally { setLoading(false) }
    }
    load()
  }, [months])

  if (loading) return <PageLoader />

  const clientPie = clientStats ? [
    { name: 'نشط', value: clientStats.active },
    { name: 'غير نشط', value: clientStats.inactive },
    { name: 'شركات', value: clientStats.companies },
  ] : []

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h2 className="page-title">التقارير</h2>
          <p className="page-subtitle">تحليل أداء المكتب</p>
        </div>
        <select className="input w-auto" value={months} onChange={e => setMonths(+e.target.value)}>
          <option value={3}>3 أشهر</option>
          <option value={6}>6 أشهر</option>
          <option value={12}>12 شهر</option>
        </select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Revenue Chart */}
        <div className="card">
          <div className="card-header">
            <h3 className="font-bold text-gray-900">الإيرادات الشهرية</h3>
          </div>
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: any) => formatMoney(v)} />
                <Legend />
                <Bar dataKey="revenue" name="محصّل" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="invoiced" name="مفوتر" fill="#93c5fd" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Client Distribution */}
        <div className="card">
          <div className="card-header">
            <h3 className="font-bold text-gray-900">توزيع العملاء</h3>
          </div>
          <div className="p-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={clientPie} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" label={({ name, value }) => `${name}: ${value}`}>
                  {clientPie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Revenue Table */}
      <div className="card">
        <div className="card-header"><h3 className="font-bold text-gray-900">تفاصيل الإيرادات الشهرية</h3></div>
        <div className="table-container rounded-t-none border-0 border-t border-gray-100">
          <table className="table">
            <thead>
              <tr><th>الشهر</th><th>السنة</th><th>إجمالي المفوتر</th><th>إجمالي المحصّل</th><th>نسبة التحصيل</th></tr>
            </thead>
            <tbody>
              {revenueData.map((row, i) => (
                <tr key={i}>
                  <td className="font-medium">{row.month}</td>
                  <td>{row.year}</td>
                  <td className="text-money">{formatMoney(row.invoiced)}</td>
                  <td className="text-money text-green-600">{formatMoney(row.revenue)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${row.invoiced > 0 ? Math.min(100, (row.revenue / row.invoiced) * 100) : 0}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-500 w-10">
                        {row.invoiced > 0 ? `${((row.revenue / row.invoiced) * 100).toFixed(0)}%` : '—'}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
