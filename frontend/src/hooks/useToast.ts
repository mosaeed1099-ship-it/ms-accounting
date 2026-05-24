import { useState, useCallback } from 'react'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface Toast {
  id: string
  message: string
  type: ToastType
}

let toastFn: ((message: string, type?: ToastType) => void) | null = null

export function setToastFn(fn: (message: string, type?: ToastType) => void) {
  toastFn = fn
}

export function toast(message: string, type: ToastType = 'success') {
  if (toastFn) toastFn(message, type)
  else console.log(`[${type}]`, message)
}

export function useToastState() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  return { toasts, addToast, removeToast }
}
