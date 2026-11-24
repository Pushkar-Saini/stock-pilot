/**
 * Demand forecasting.
 *
 * These are transparent statistical calculations (moving averages and the classic
 * reorder-point formula), not machine learning:
 *   Average daily usage   = consumption in window / days in window
 *   Reorder point (ROP)   = ADU × supplier lead time + safety stock
 *   Days until stockout   = current stock / ADU
 *   Recommended reorder   = ADU × (lead time + planning period) + safety stock − current stock
 */
import type { InventoryState, Product, StockMovement, StockStatus } from './types';

export const DAY_MS = 86_400_000;
const MIN_HISTORY_DAYS = 3;

export function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface Forecast {
  productId: string;
  avgDailyUsage: number;
  /** true when history was too thin and the product's demo estimate was used instead */
  isEstimate: boolean;
  daysOfHistory: number;
  consumptionInWindow: number;
  currentStock: number;
  leadTimeDays: number;
  safetyStock: number;
  reorderPoint: number;
  daysUntilStockout: number | null;
  stockoutDate: number | null;
  recommendedQty: number;
  needsReorder: boolean;
  status: StockStatus;
  /** % change of the last 7 days vs the 7 before */
  trendPct: number | null;
}

export interface ForecastOptions {
  windowDays: number;
  planningPeriodDays: number;
  now?: number;
  demandMultiplier?: number;
}

/** Units consumed (sales / stock-out) per product within [from, to). */
function consumptionByProduct(movements: StockMovement[], from: number, to: number): Map<string, number> {
  const m = new Map<string, number>();
  for (const mv of movements) {
    if (mv.type !== 'out' || mv.timestamp < from || mv.timestamp >= to) continue;
    m.set(mv.productId, (m.get(mv.productId) ?? 0) + -mv.change);
  }
  return m;
}

function earliestRecord(movements: StockMovement[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const mv of movements) {
    const cur = m.get(mv.productId);
    if (cur === undefined || mv.timestamp < cur) m.set(mv.productId, mv.timestamp);
  }
  return m;
}

export function computeStatus(p: Pick<Product, 'quantity' | 'safetyStock' | 'minStock' | 'leadTimeDays'>, adu: number, rop: number): StockStatus {
  if (p.quantity <= 0) return 'out';
  const days = adu > 0 ? p.quantity / adu : Infinity;
  if (p.quantity <= p.safetyStock || days <= p.leadTimeDays) return 'critical';
  if (p.quantity <= Math.max(p.minStock, rop)) return 'low';
  return 'healthy';
}

export function forecastAll(state: InventoryState, opts: ForecastOptions): Map<string, Forecast> {
  const now = opts.now ?? Date.now();
  const windowStart = now - opts.windowDays * DAY_MS;
  const consumption = consumptionByProduct(state.movements, windowStart, now + 1);
  const last7 = consumptionByProduct(state.movements, now - 7 * DAY_MS, now + 1);
  const prev7 = consumptionByProduct(state.movements, now - 14 * DAY_MS, now - 7 * DAY_MS);
  const firstSeen = earliestRecord(state.movements);
  const mult = opts.demandMultiplier ?? 1;
  const out = new Map<string, Forecast>();

  for (const p of state.products) {
    const first = Math.min(firstSeen.get(p.id) ?? p.createdAt, p.createdAt);
    const daysOfHistory = Math.min(opts.windowDays, Math.max(0, (now - Math.max(first, windowStart)) / DAY_MS));
    const used = consumption.get(p.id) ?? 0;
    const enough = daysOfHistory >= MIN_HISTORY_DAYS && used > 0;
    const baseAdu = enough ? used / Math.max(1, daysOfHistory) : p.demoDailyEstimate;
    const adu = baseAdu * mult;
    const rop = adu * p.leadTimeDays + p.safetyStock;
    const daysUntil = adu > 0 ? p.quantity / adu : null;
    const recommended = Math.max(0, Math.ceil(adu * (p.leadTimeDays + opts.planningPeriodDays) + p.safetyStock - p.quantity));
    const l7 = last7.get(p.id) ?? 0;
    const p7 = prev7.get(p.id) ?? 0;
    out.set(p.id, {
      productId: p.id,
      avgDailyUsage: adu,
      isEstimate: !enough,
      daysOfHistory,
      consumptionInWindow: used,
      currentStock: p.quantity,
      leadTimeDays: p.leadTimeDays,
      safetyStock: p.safetyStock,
      reorderPoint: rop,
      daysUntilStockout: daysUntil,
      stockoutDate: daysUntil !== null ? now + daysUntil * DAY_MS : null,
      recommendedQty: recommended,
      needsReorder: p.quantity <= rop,
      status: computeStatus(p, adu, rop),
      trendPct: p7 > 0 ? ((l7 - p7) / p7) * 100 : null,
    });
  }
  return out;
}

/** Units sold per day for one product (or all if productId omitted), oldest first. */
export function dailySeries(state: InventoryState, days: number, productId?: string, now = Date.now()): { day: number; units: number; revenue: number }[] {
  const today = startOfDay(now);
  const series = Array.from({ length: days }, (_, i) => ({ day: today - (days - 1 - i) * DAY_MS, units: 0, revenue: 0 }));
  const first = series[0].day;
  for (const t of state.transactions) {
    if (productId && t.productId !== productId) continue;
    if (t.timestamp < first) continue;
    const idx = Math.floor((startOfDay(t.timestamp) - first) / DAY_MS);
    if (idx >= 0 && idx < days) {
      series[idx].units += t.quantity;
      series[idx].revenue += t.total;
    }
  }
  return series;
}
