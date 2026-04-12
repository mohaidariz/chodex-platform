import { cn } from '@/lib/utils'
import { type LucideIcon } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: number | string
  icon: LucideIcon
  description?: string
  trend?: { value: number; label: string }
  className?: string
  iconColor?: string
  iconBg?: string
}

export function StatsCard({
  title,
  value,
  icon: Icon,
  description,
  className,
  iconColor = 'text-blue-600',
  iconBg = 'bg-blue-50',
}: StatsCardProps) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex items-start gap-4',
        className
      )}
    >
      <div className={cn('flex items-center justify-center w-12 h-12 rounded-lg flex-shrink-0', iconBg)}>
        <Icon className={cn('w-6 h-6', iconColor)} />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500">{title}</p>
        <p className="text-2xl font-bold text-slate-900 mt-0.5">{value}</p>
        {description && (
          <p className="text-xs text-slate-400 mt-1">{description}</p>
        )}
      </div>
    </div>
  )
}
