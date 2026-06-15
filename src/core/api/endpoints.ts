/** Typed endpoint constants — single source of truth for all API paths. */
export const EP = {
  // Auth
  LOGIN: '/auth/login',
  ME: '/auth/me',

  // Clients
  CLIENTS: '/clients',
  CLIENT: (id: number) => `/clients/${id}`,

  // Tasks
  TASKS: '/tasks',
  TASK: (id: number) => `/tasks/${id}`,

  // Leads
  LEADS: '/leads',
  LEAD: (id: number) => `/leads/${id}`,

  // Obligations
  OBLIGATION_INSTANCES: '/obligations/instances',
  OBLIGATION_INSTANCE: (id: number) => `/obligations/instances/${id}`,

  // Monthly Fees
  MF_RECORDS: '/monthly-fees/records',
  MF_RECORD_PAY: (id: number) => `/monthly-fees/records/${id}/pay`,

  // Collections
  COLLECTIONS: '/collections',
  COLLECTION: (id: number) => `/collections/${id}`,

  // Accounting
  ACC_TRANSACTIONS: (clientId: number) => `/accounting/${clientId}/transactions`,
  ACC_JOURNAL_ENTRIES: (clientId: number) => `/accounting/${clientId}/journal-entries`,
  ACC_JOURNAL_ENTRY: (clientId: number, jeId: number) =>
    `/accounting/${clientId}/journal-entries/${jeId}`,
  ACC_ADVANCES: (clientId: number) => `/accounting/${clientId}/advances`,
  ACC_ADVANCE_SETTLE: (clientId: number, advId: number) =>
    `/accounting/${clientId}/advances/${advId}/settle`,

  // Dashboard
  DASHBOARD_STATS: '/dashboard/stats',
  DASHBOARD_RECENT: '/dashboard/recent-activity',
  DASHBOARD_DEADLINES: '/dashboard/upcoming-deadlines',

  // Invoices
  INVOICES: '/invoices',
  INVOICE: (id: number) => `/invoices/${id}`,
} as const
