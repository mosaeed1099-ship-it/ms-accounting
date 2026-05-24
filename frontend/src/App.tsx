import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { Layout } from './components/layout/Layout'
import { ToastContainer } from './components/ui/Toast'
import { useAuthStore } from './store/authStore'
import { useToastState, setToastFn } from './hooks/useToast'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Clients from './pages/Clients'
import Invoices from './pages/Invoices'
import Tasks from './pages/Tasks'
import Documents from './pages/Documents'
import Tax from './pages/Tax'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Leads from './pages/Leads'
import Establishment from './pages/Establishment'
import Obligations from './pages/Obligations'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  if (isAuthenticated) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  const { toasts, addToast, removeToast } = useToastState()

  useEffect(() => {
    setToastFn(addToast)
  }, [addToast])

  return (
    <BrowserRouter>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
      <Routes>
        <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="clients" element={<Clients />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="tasks" element={<Tasks />} />
          <Route path="documents" element={<Documents />} />
          <Route path="tax" element={<Tax />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
          <Route path="leads" element={<Leads />} />
          <Route path="establishment" element={<Establishment />} />
          <Route path="obligations" element={<Obligations />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
