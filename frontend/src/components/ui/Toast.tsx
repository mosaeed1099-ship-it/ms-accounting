import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'
import type { Toast } from '../../hooks/useToast'

const icons = {
  success: <CheckCircle className="w-5 h-5 text-green-500" />,
  error: <XCircle className="w-5 h-5 text-red-500" />,
  warning: <AlertTriangle className="w-5 h-5 text-yellow-500" />,
  info: <Info className="w-5 h-5 text-blue-500" />,
}

const borders = {
  success: 'border-r-4 border-green-500',
  error: 'border-r-4 border-red-500',
  warning: 'border-r-4 border-yellow-500',
  info: 'border-r-4 border-blue-500',
}

interface ToastContainerProps {
  toasts: Toast[]
  onRemove: (id: string) => void
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
  if (!toasts.length) return null
  return (
    <div className="fixed top-4 left-4 z-[9999] flex flex-col gap-2 min-w-72 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-start gap-3 bg-white rounded-lg shadow-lg p-4 ${borders[t.type]} animate-[slideIn_0.2s_ease-out]`}
        >
          {icons[t.type]}
          <p className="flex-1 text-sm text-gray-800">{t.message}</p>
          <button onClick={() => onRemove(t.id)} className="text-gray-400 hover:text-gray-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
