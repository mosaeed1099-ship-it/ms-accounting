export function formatMoney(amount: number, currency = 'EGP'): string {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date?: string | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date?: string | null): string {
  if (!date) return '—'
  return new Intl.DateTimeFormat('ar-EG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function formatFileSize(bytes?: number | null): string {
  if (!bytes) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const clientStatusLabels: Record<string, string> = {
  active: 'نشط',
  inactive: 'غير نشط',
  prospect: 'محتمل',
  suspended: 'موقوف',
}

export const clientTypeLabels: Record<string, string> = {
  company: 'شركة',
  individual: 'فرد',
  freelancer: 'عمل حر',
}

export const invoiceStatusLabels: Record<string, string> = {
  draft: 'مسودة',
  sent: 'مرسلة',
  paid: 'مسددة',
  partial: 'مدفوعة جزئيًا',
  overdue: 'متأخرة',
  cancelled: 'ملغاة',
}

export const taskStatusLabels: Record<string, string> = {
  todo: 'قيد الانتظار',
  in_progress: 'جاري التنفيذ',
  review: 'قيد المراجعة',
  done: 'مكتملة',
  cancelled: 'ملغاة',
}

export const taskPriorityLabels: Record<string, string> = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية',
  urgent: 'عاجلة',
}

export const taskCategoryLabels: Record<string, string> = {
  tax: 'ضرائب',
  accounting: 'محاسبة',
  audit: 'مراجعة',
  payroll: 'مرتبات',
  legal: 'قانوني',
  consultation: 'استشارة',
  other: 'أخرى',
}

export const governorates = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'الدقهلية', 'البحيرة', 'الشرقية',
  'المنوفية', 'الغربية', 'القليوبية', 'الفيوم', 'بني سويف', 'المنيا',
  'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر',
  'الوادي الجديد', 'مطروح', 'شمال سيناء', 'جنوب سيناء',
  'الإسماعيلية', 'السويس', 'بورسعيد', 'دمياط', 'كفر الشيخ',
]
