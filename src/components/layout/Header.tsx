import { Bell, Search, Menu } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

interface HeaderProps {
  title: string
  onMenuToggle?: () => void
}

const roleLabels: Record<string, string> = {
  admin: 'مدير النظام',
  manager: 'مدير',
  accountant: 'محاسب',
  viewer: 'مشاهد',
}

export function Header({ title, onMenuToggle }: HeaderProps) {
  const { user } = useAuthStore()

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center gap-4 px-6 flex-shrink-0">
      {onMenuToggle && (
        <button onClick={onMenuToggle} className="btn-ghost btn-sm md:hidden">
          <Menu className="w-5 h-5" />
        </button>
      )}
      <h1 className="text-base font-bold text-gray-900">{title}</h1>

      <div className="flex-1" />

      <div className="flex items-center gap-2">
        <button className="btn-ghost btn-sm relative" title="الإشعارات">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        <div className="flex items-center gap-2 border-r border-gray-200 pr-3 mr-1">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium text-gray-900">{user?.name}</div>
            <div className="text-xs text-gray-400">{user?.role ? roleLabels[user.role] : ''}</div>
          </div>
          <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white font-bold text-sm">
            {user?.name?.charAt(0)}
          </div>
        </div>
      </div>
    </header>
  )
}
