import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, FileText, CheckSquare, FolderOpen,
  Calculator, BarChart3, Settings, LogOut, ChevronLeft, Building2,
  UserPlus, Briefcase, Bell,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import clsx from 'clsx'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'الرئيسية', exact: true },
  { to: '/clients', icon: Users, label: 'العملاء' },
  { to: '/leads', icon: UserPlus, label: 'العملاء المحتملين' },
  { to: '/invoices', icon: FileText, label: 'الفواتير' },
  { to: '/tasks', icon: CheckSquare, label: 'المهام' },
  { to: '/obligations', icon: Bell, label: 'الالتزامات الضريبية' },
  { to: '/establishment', icon: Briefcase, label: 'تأسيس الشركات' },
  { to: '/documents', icon: FolderOpen, label: 'الأرشيف' },
  { to: '/tax', icon: Calculator, label: 'الإقرارات الضريبية' },
  { to: '/reports', icon: BarChart3, label: 'التقارير' },
  { to: '/settings', icon: Settings, label: 'الإعدادات' },
]

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, logout } = useAuthStore()

  return (
    <aside
      className={clsx(
        'h-screen bg-white border-l border-gray-200 flex flex-col transition-all duration-300 flex-shrink-0',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-gray-100">
        <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <Building2 className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div>
            <div className="font-bold text-gray-900 text-sm leading-tight">MS Accounting</div>
            <div className="text-xs text-gray-400">مكتب المحاسبة</div>
          </div>
        )}
        <button
          onClick={onToggle}
          className="mr-auto text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
        >
          <ChevronLeft className={clsx('w-4 h-4 transition-transform', collapsed && 'rotate-180')} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-0.5">
        {navItems.map(({ to, icon: Icon, label, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            className={({ isActive }) =>
              clsx('sidebar-link', isActive ? 'sidebar-link-active' : 'sidebar-link-inactive')
            }
            title={collapsed ? label : undefined}
          >
            <Icon className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User */}
      <div className="border-t border-gray-100 p-3">
        <div className={clsx('flex items-center gap-3', collapsed && 'justify-center')}>
          <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-bold text-sm flex-shrink-0">
            {user?.name?.charAt(0)}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">{user?.name}</div>
              <div className="text-xs text-gray-400 truncate">{user?.email}</div>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={logout}
              className="text-gray-400 hover:text-red-500 p-1 rounded-lg hover:bg-red-50"
              title="تسجيل الخروج"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
