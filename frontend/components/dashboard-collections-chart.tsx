"use client"

import * as React from "react"
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"

export interface CollectionsPoint {
  /** "YYYY-MM" */
  month: string
  /** Collected (paid) receipts across the whole platform */
  paid: number
  /** Students / receipts still awaiting payment */
  unpaid: number
}

const chartConfig = {
  collections: {
    label: "Collections",
  },
  paid: {
    label: "Paid",
    color: "var(--chart-2)",
  },
  unpaid: {
    label: "Unpaid",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

function inr(n: number) {
  return `₹ ${n.toLocaleString("en-IN")}`
}

function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString("en-IN", {
    month: "short",
  })
}

function monthLongLabel(month: string) {
  const [y, m] = month.split("-").map(Number)
  return new Date(y, (m || 1) - 1, 1).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  })
}

const monthNumber = (month: string) => Number(month.replace("-", ""))

export function DashboardCollectionsChart({
  data,
  totals,
  className,
}: {
  data: CollectionsPoint[]
  totals: { paid: number; unpaid: number }
  className?: string
}) {
  const [activeChart, setActiveChart] =
    React.useState<keyof typeof chartConfig>("paid")

  const hasData = data.some((d) => d.paid !== 0 || d.unpaid !== 0)

  return (
    <Card
      className={`gap-0 overflow-hidden py-0 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className ?? ""}`}
    >
      <CardHeader className="flex flex-col border-b p-0! sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-0!">
          <CardTitle className="text-[13px] font-semibold tracking-tight">
            Collections by month
          </CardTitle>
          <CardDescription className="text-xs">
            {hasData
              ? "Toggle between collected and unpaid dues · Jan – Dec"
              : "Summed from the Receipts and Payments pages"}
          </CardDescription>
        </div>
        <div className="flex">
          {(["paid", "unpaid"] as const).map((key) => (
            <button
              key={key}
              data-active={activeChart === key}
              aria-pressed={activeChart === key}
              className="relative z-30 flex flex-1 flex-col justify-center gap-1 border-t px-4 py-3 text-left even:border-l transition-colors hover:bg-muted/40 data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-6 sm:py-4"
              onClick={() => setActiveChart(key)}
            >
              <span className="text-xs text-muted-foreground">
                {chartConfig[key].label}
              </span>
              <span className="text-lg leading-none font-bold tabular-nums sm:text-xl">
                {inr(totals[key])}
              </span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 pb-4 sm:p-4">
        {hasData ? (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[200px] w-full"
          >
            <BarChart
              accessibilityLayer
              data={data}
              margin={{
                left: 4,
                right: 4,
                top: 8,
              }}
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={8}
                tickFormatter={monthLabel}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    className="w-[170px]"
                    nameKey="collections"
                    labelFormatter={(value) =>
                      monthLongLabel(String(value).slice(0, 7))
                    }
                    formatter={(value) => (
                      <span className="font-mono font-medium tabular-nums text-foreground">
                        {inr(Number(value))}
                      </span>
                    )}
                  />
                }
              />
              <Bar
                dataKey={activeChart}
                fill={`var(--color-${activeChart})`}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        ) : (
          <p className="flex h-[200px] items-center justify-center text-center text-sm text-muted-foreground">
            No dated payments or unpaid dues yet — record a payment on the
            Receipts page to see monthly totals here.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export function sortMonthPoints(data: CollectionsPoint[]): CollectionsPoint[] {
  return [...data].sort(
    (a, b) => monthNumber(a.month) - monthNumber(b.month)
  )
}
