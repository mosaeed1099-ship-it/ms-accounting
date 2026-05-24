export interface User {
  id: number
  name: string
  email: string
  phone?: string
  role: 'admin' | 'manager' | 'accountant' | 'viewer'
  is_active: boolean
  avatar?: string
  last_login?: string
  created_at: string
}

export interface Client {
  id: number
  code: string
  name: string
  name_en?: string
  client_type: 'company' | 'individual' | 'freelancer'
  status: 'active' | 'inactive' | 'prospect' | 'suspended'
  email?: string
  phone?: string
  phone2?: string
  address?: string
  governorate?: string
  city?: string
  commercial_register?: string
  tax_number?: string
  national_id?: string
  activity?: string
  activity_code?: string
  tax_type: 'vat' | 'income' | 'withholding' | 'stamp' | 'none'
  contract_value: number
  payment_terms: number
  credit_limit: number
  balance: number
  contract_start?: string
  contract_end?: string
  contract_renewal_date?: string
  notes?: string
  tags?: string
  assigned_accountant_id?: number
  assigned_accountant?: string
  created_at: string
  updated_at?: string
  contacts?: ClientContact[]
}

export interface ClientContact {
  id: number
  name: string
  position?: string
  email?: string
  phone?: string
  is_primary: boolean
}

export interface InvoiceItem {
  id?: number
  description: string
  quantity: number
  unit_price: number
  total: number
  tax_percent: number
}

export interface Invoice {
  id: number
  invoice_number: string
  client_id: number
  client_name?: string
  status: 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'cancelled'
  issue_date: string
  due_date?: string
  payment_date?: string
  subtotal: number
  discount_percent: number
  discount_amount: number
  tax_percent: number
  tax_amount: number
  stamp_tax: number
  withholding_tax: number
  total: number
  paid_amount: number
  remaining: number
  description?: string
  notes?: string
  payment_method?: string
  items: InvoiceItem[]
  payments: Payment[]
  created_at: string
}

export interface Payment {
  id: number
  amount: number
  payment_date: string
  payment_method?: string
  reference?: string
}

export interface Task {
  id: number
  title: string
  description?: string
  client_id?: number
  client_name?: string
  status: 'todo' | 'in_progress' | 'review' | 'done' | 'cancelled'
  priority: 'low' | 'medium' | 'high' | 'urgent'
  category: 'tax' | 'accounting' | 'audit' | 'payroll' | 'legal' | 'consultation' | 'other'
  due_date?: string
  completed_at?: string
  estimated_hours?: number
  actual_hours?: number
  tags?: string
  assigned_to?: number
  assigned_to_name?: string
  created_by?: number
  created_by_name?: string
  created_at: string
  updated_at?: string
  comments_count: number
}

export interface TaxReturn {
  id: number
  client_id: number
  client_name?: string
  return_type: string
  return_type_label: string
  status: 'pending' | 'in_progress' | 'submitted' | 'approved' | 'rejected' | 'late'
  period_year: number
  period_month?: number
  period_quarter?: number
  due_date?: string
  submission_date?: string
  tax_amount: number
  penalty: number
  reference_number?: string
  notes?: string
  assigned_to?: number
  assigned_to_name?: string
  created_at: string
}

export interface Document {
  id: number
  name: string
  original_name?: string
  file_type?: string
  file_size?: number
  category: string
  client_id?: number
  client_name?: string
  description?: string
  tags?: string
  year?: number
  month?: number
  uploaded_by?: string
  created_at: string
}

export interface DashboardStats {
  clients: {
    total: number
    active: number
    new_this_month: number
  }
  financial: {
    total_invoiced: number
    total_collected: number
    total_outstanding: number
    total_overdue: number
    monthly_revenue: number
  }
  tasks: {
    pending: number
    overdue: number
    urgent: number
  }
  tax: {
    pending: number
    late: number
  }
}

export interface PaginatedResponse<T> {
  total: number
  page: number
  page_size?: number
  items: T[]
}
