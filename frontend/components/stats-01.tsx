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
          'grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4',
          className
        )}
      >
        {stats.map((stat) => (
          <Card
            className="rounded-none border-0 py-0 shadow-none"
            key={stat.name}
          >
            <CardContent className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 p-4 sm:p-6">
              <div className="font-medium text-muted-foreground text-sm">
                {stat.name}
              </div>
              <div
                className={cn(
                  'font-medium text-xs tabular-nums',
                  stat.changeType === 'positive' &&
                    'text-green-800 dark:text-green-400',
                  stat.changeType === 'negative' &&
                    'text-red-800 dark:text-red-400',
                  stat.changeType === 'neutral' && 'text-muted-foreground'
                )}
              >
                {stat.change}
              </div>
              <div className="w-full flex-none font-medium text-3xl text-foreground tabular-nums tracking-tight">
                {stat.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
