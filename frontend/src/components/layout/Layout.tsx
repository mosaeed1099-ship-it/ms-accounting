import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

const pageTitles: Record<string, string> = {
  '/': 'لوحة التحكم',
  '/clients': 'إدارة العملاء',
  '/invoices': 'الفواتير والمدفوعات',
  '/tasks': 'إدارة المهام',
  '/documents': 'الأرشيف والمستندات',
  '/tax': 'الإقرارات الضريبية',
  '/reports': 'التقارير',
  '/settings': 'الإعدادات',
}

export function Layout() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const title = pageTitles[location.pathname] || 'MS Accounting'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header title={title} />
        <main className="flex-1 overflow-y-auto p-6 page-enter">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
