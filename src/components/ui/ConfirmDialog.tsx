import { AlertTriangle } from 'lucide-react'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  loading?: boolean
}

export function ConfirmDialog({
  isOpen, onClose, onConfirm, title, message,
  confirmLabel = 'تأكيد', danger = false, loading = false,
}: ConfirmDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={loading}>إلغاء</button>
          <button
            className={danger ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? 'جاري التنفيذ...' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="flex gap-4 items-start">
        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5 text-red-600" />
        </div>
        <p className="text-gray-600 text-sm leading-relaxed">{message}</p>
      </div>
    </Modal>
  )
}
