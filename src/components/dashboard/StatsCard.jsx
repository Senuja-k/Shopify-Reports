import { cn } from '@/lib/utils';

export function StatsCard({ title, value, subtitle, icon, trend, trendValue, className }) {
  return (
    <div className={cn("glass-card rounded-lg p-3 sm:p-5 hover-lift", className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-0.5 sm:space-y-1">
          <p className="text-xs sm:text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-lg sm:text-2xl font-bold tracking-tight">{value}</p>
          {subtitle && (
            <p className="text-[10px] sm:text-xs text-muted-foreground">{subtitle}</p>
          )}
          {trend && trendValue && (
            <div className={cn(
              "inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full mt-1",
              trend === 'up' && "bg-success/10 text-success",
              trend === 'down' && "bg-destructive/10 text-destructive",
              trend === 'neutral' && "bg-muted text-muted-foreground"
            )}>
              {trendValue}
            </div>
          )}
        </div>
        <div className="p-1.5 sm:p-2.5 rounded-lg bg-primary/10">
          {icon && (typeof icon === 'function' ? (
            icon({ className: 'h-4 w-4 sm:h-5 sm:w-5 text-primary' })
          ) : (
            icon
          ))}
        </div>
      </div>
    </div>
  );
}
