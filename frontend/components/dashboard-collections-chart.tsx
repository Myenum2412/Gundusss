"use client"

import * as React from "react"
import { Bar, BarChart, CartesianGrid, Label, Pie, PieChart, XAxis } from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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

/* ------------------------------------------------------------------ */
/* By payment method — donut chart with center text                    */
/* ------------------------------------------------------------------ */

export interface MethodSlice {
  method: string
  count: number
  total: number
}

const METHOD_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]

const methodKey = (method: string) =>
  `m-${method.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`

export function DashboardMethodsDonut({
  methods,
  receiptCount,
  className,
}: {
  /** All methods, sorted by total descending */
  methods: MethodSlice[]
  /** Total receipts across every method — shown in the footer */
  receiptCount: number
  className?: string
}) {
  // Top 5 methods get their own slice; everything else folds into "Other".
  const slices = React.useMemo(() => {
    const top = methods.slice(0, 5)
    const rest = methods.slice(5)
    const out = top.map((m, i) => ({
      key: methodKey(m.method),
      label: m.method,
      count: m.count,
      total: m.total,
      color: METHOD_PALETTE[i % METHOD_PALETTE.length],
    }))
    if (rest.length > 0) {
      out.push({
        key: "m-other",
        label: `Other (${rest.length} methods)`,
        count: rest.reduce((s, m) => s + m.count, 0),
        total: rest.reduce((s, m) => s + m.total, 0),
        color: "var(--muted-foreground)",
      })
    }
    return out
  }, [methods])

  const chartConfig = React.useMemo(() => {
    const config: ChartConfig = {
      total: { label: "Collected" },
    }
    for (const s of slices) {
      config[s.key] = { label: s.label, color: s.color }
    }
    return config
  }, [slices])

  const chartData = React.useMemo(
    () =>
      slices.map((s) => ({
        method: s.key,
        label: s.label,
        count: s.count,
        total: s.total,
        fill: `var(--color-${s.key})`,
      })),
    [slices]
  )

  const total = React.useMemo(
    () => slices.reduce((sum, s) => sum + s.total, 0),
    [slices]
  )

  const isEmpty = total <= 0

  return (
    <Card
      className={`flex flex-col rounded-2xl py-0 shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className ?? ""}`}
    >
      <CardHeader className="items-center gap-1 pb-0! pt-4 sm:pt-6">
        <CardTitle className="text-[13px] font-semibold tracking-tight">
          By payment method
        </CardTitle>
        <CardDescription className="text-xs">
          {isEmpty ? "Summed from the Receipts page" : "Share of collected fees"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0!">
        {isEmpty ? (
          <p className="flex h-[220px] items-center justify-center text-center text-sm text-muted-foreground">
            No receipts yet.
          </p>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="mx-auto aspect-square max-h-[210px] w-full"
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent hideLabel formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {chartConfig[String(name) as keyof typeof chartConfig]?.label || name}
                      </span>
                      <span className="font-mono font-medium tabular-nums text-foreground">
                        {inr(Number(value))}
                      </span>
                    </div>
                  )} />
                }
              />
              <Pie
                data={chartData}
                dataKey="total"
                nameKey="method"
                innerRadius={58}
                outerRadius={90}
                strokeWidth={4}
              >
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) - 4}
                            className="fill-foreground text-xl font-bold tabular-nums"
                          >
                            {inr(total)}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 18}
                            className="fill-muted-foreground text-xs"
                          >
                            Collected
                          </tspan>
                        </text>
                      )
                    }
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
        )}
      </CardContent>
      <CardFooter className="flex-col items-start gap-1 px-4! py-3 text-xs">
        {slices.map((s) => (
          <div key={s.key} className="flex w-full items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="truncate text-muted-foreground">{s.label}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-foreground">
              {inr(s.total)}
            </span>
          </div>
        ))}
        <p className="mt-1 text-[11px] text-muted-foreground">
          {receiptCount} receipt{receiptCount === 1 ? "" : "s"} issued · {slices.length} method{slices.length === 1 ? "" : "s"}
        </p>
      </CardFooter>
    </Card>
  )
}
