import type { StatChangeType } from "@/components/stats-01";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Month-over-month trend for the stats-01 block.
 * Read-only: derives { change, changeType } from date strings (YYYY-MM-DD
 * or ISO) already stored by each page. Pass `amount` to trend on sums
 * instead of counts, and `invert` when down is good (failures, dues).
 */
export function momTrend(
  entries: { date?: string; amount?: number }[],
  opts?: { invert?: boolean }
): { change: string; changeType: StatChangeType } {
  const now = new Date();
  const curKey = monthKey(now);
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevKey = monthKey(prev);

  let cur = 0;
  let prv = 0;
  for (const e of entries) {
    const k = (e.date ?? "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(k)) continue;
    const v = e.amount ?? 1;
    if (k === curKey) cur += v;
    else if (k === prevKey) prv += v;
  }

  if (prv === 0 && cur === 0) return { change: "—", changeType: "neutral" };

  let change: string;
  let dir: 1 | -1 | 0;
  if (prv === 0) {
    change = "New";
    dir = 1;
  } else {
    const pct = ((cur - prv) / Math.abs(prv)) * 100;
    const rounded = Math.abs(pct) < 0.05 ? 0 : pct;
    change = `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}%`;
    dir = rounded > 0 ? 1 : rounded < 0 ? -1 : 0;
  }

  if (dir === 0) return { change, changeType: "neutral" };
  const good = opts?.invert ? dir < 0 : dir > 0;
  return { change, changeType: good ? "positive" : "negative" };
}
