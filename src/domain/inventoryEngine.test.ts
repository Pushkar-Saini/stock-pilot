import { describe, expect, it } from 'vitest';
import { adjustStock, receiveStock, recordSale } from './inventoryEngine';
import { createSeedState } from './seed';
import { forecastAll } from './forecasting';

const nuts = (s: ReturnType<typeof createSeedState>) => s.products.find((p) => p.name === 'M10 Nuts')!;

describe('inventory engine', () => {
  it('a sale reduces stock exactly once and creates one transaction + movement', () => {
    const s0 = createSeedState();
    const before = nuts(s0).quantity;
    const r = recordSale(s0, { productId: nuts(s0).id, quantity: 3, source: 'simulation', idempotencyKey: 'c1' });
    expect(r.ok).toBe(true);
    expect(nuts(r.state).quantity).toBe(before - 3);
    expect(r.state.transactions.length).toBe(s0.transactions.length + 1);
    expect(r.state.movements.length).toBe(s0.movements.length + 1);
    expect(r.state.transactions[0]).toMatchObject({ quantity: 3, source: 'simulation', total: 3 * nuts(s0).sellingPrice });
    expect(r.state.movements[0]).toMatchObject({ type: 'out', change: -3, previousStock: before, newStock: before - 3 });
  });

  it('rejects duplicate idempotency keys', () => {
    const s0 = createSeedState();
    const r1 = recordSale(s0, { productId: nuts(s0).id, quantity: 3, source: 'simulation', idempotencyKey: 'dup' });
    const r2 = recordSale(r1.state, { productId: nuts(s0).id, quantity: 3, source: 'simulation', idempotencyKey: 'dup' });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.code).toBe('DUPLICATE');
    expect(nuts(r2.state).quantity).toBe(nuts(s0).quantity - 3);
  });

  it('never lets stock go negative', () => {
    const s0 = createSeedState();
    const washers = s0.products.find((p) => p.name === 'Washers')!;
    expect(washers.quantity).toBe(0);
    const r = recordSale(s0, { productId: washers.id, quantity: 1, source: 'manual' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('OUT_OF_STOCK');
    const big = recordSale(s0, { productId: nuts(s0).id, quantity: nuts(s0).quantity + 1, source: 'manual' });
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.code).toBe('INSUFFICIENT_STOCK');
    const bad = recordSale(s0, { productId: nuts(s0).id, quantity: 1.5, source: 'manual' });
    expect(bad.ok).toBe(false);
  });

  it('stock in and adjustments log previous/new stock', () => {
    const s0 = createSeedState();
    const id = nuts(s0).id;
    const q = nuts(s0).quantity;
    const r = receiveStock(s0, { productId: id, quantity: 50 });
    expect(nuts(r.state).quantity).toBe(q + 50);
    expect(r.state.purchases.length).toBe(s0.purchases.length + 1);
    const a = adjustStock(r.state, { productId: id, countedQuantity: q + 45, reason: 'Count' });
    expect(a.ok).toBe(true);
    expect(a.state.movements[0]).toMatchObject({ type: 'adjustment', change: -5, previousStock: q + 50, newStock: q + 45 });
    expect(adjustStock(a.state, { productId: id, countedQuantity: -1, reason: 'x' }).ok).toBe(false);
  });

  it('seed history is internally consistent', () => {
    const s = createSeedState();
    for (const p of s.products) {
      const mv = s.movements.filter((m) => m.productId === p.id).sort((a, b) => a.timestamp - b.timestamp);
      for (let i = 1; i < mv.length; i++) expect(mv[i].previousStock).toBe(mv[i - 1].newStock);
      for (const m of mv) {
        expect(m.newStock).toBeGreaterThanOrEqual(0);
        expect(m.newStock - m.previousStock).toBe(m.change);
      }
      if (mv.length) expect(mv[mv.length - 1].newStock).toBe(p.quantity);
    }
  });

  it('forecast reflects new consumption', () => {
    const s0 = createSeedState();
    const opts = { windowDays: 30, planningPeriodDays: 14 };
    const f0 = forecastAll(s0, opts).get(nuts(s0).id)!;
    const r = recordSale(s0, { productId: nuts(s0).id, quantity: 30, source: 'manual' });
    const f1 = forecastAll(r.state, opts).get(nuts(s0).id)!;
    expect(f0.isEstimate).toBe(false);
    expect(f1.consumptionInWindow).toBe(f0.consumptionInWindow + 30);
    expect(f1.avgDailyUsage).toBeGreaterThan(f0.avgDailyUsage);
    expect(f1.reorderPoint).toBeCloseTo(f1.avgDailyUsage * nuts(s0).leadTimeDays + nuts(s0).safetyStock);
  });
});
