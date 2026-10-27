import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type StatChangeType = 'positive' | 'negative' | 'neutral';

export interface StatItem {
  name: string;
  value: string;
  change: string;
  changeType: StatChangeType;
}

export default function Stats01({
  stats,
  className,
}: {
  stats: StatItem[];
  className?: string;
}) {
  return (
    <div className="w-full shrink-0">
      <div
        className={cn(
          'grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4',
          className
        )}
      >
        {stats.map((stat) => (
          <Card
            className="min-w-0 rounded-none border-0 py-0 shadow-none"
            key={stat.name}
          >
            <CardContent className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 p-3 sm:p-4 lg:p-6">
              <div className="min-w-0 font-medium text-muted-foreground text-[11px] leading-snug sm:text-sm">
                {stat.name}
              </div>
              <div
                className={cn(
                  'font-medium text-[10px] tabular-nums leading-snug sm:text-xs',
                  stat.changeType === 'positive' &&
                    'text-green-800 dark:text-green-400',
                  stat.changeType === 'negative' &&
                    'text-red-800 dark:text-red-400',
                  stat.changeType === 'neutral' && 'text-muted-foreground'
                )}
              >
                {stat.change}
              </div>
              <div className="mt-1 w-full min-w-0 flex-none font-semibold text-xl text-foreground leading-tight tabular-nums tracking-tight break-words sm:text-2xl lg:text-3xl">
                {stat.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
