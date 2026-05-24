export function Spinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const s = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' }[size]
  return (
    <div className={`${s} border-2 border-gray-200 border-t-primary-600 rounded-full animate-spin`} />
  )
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex flex-col items-center gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-gray-500">جاري التحميل...</p>
      </div>
    </div>
  )
}
