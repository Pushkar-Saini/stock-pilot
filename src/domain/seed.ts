/**
 * Demo dataset: a small hardware shop with 30 days of generated (deterministic) history.
 * All figures are fictional demonstration data.
 */
import type { InventoryState, Product, PurchaseRecord, StockMovement, Supplier, Transaction } from './types';
import { DAY_MS, startOfDay } from './forecasting';
import { round2 } from './inventoryEngine';

export const SEED_VERSION = 1;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const suppliers: Supplier[] = [
  {
    id: 'SUP-1', name: 'Bharat Fasteners Pvt. Ltd.', contactPerson: 'Rakesh Mehta', phone: '+91 98200 11223',
    email: 'orders@bharatfasteners.example', address: 'Plot 14, MIDC Bhosari, Pune', avgDeliveryDays: 4, reliability: 94,
    notes: 'Bulk discounts above 1,000 pcs.',
  },
  {
    id: 'SUP-2', name: 'Shakti Steel & Metals', contactPerson: 'Anita Rao', phone: '+91 99010 44556',
    email: 'sales@shaktisteel.example', address: 'Industrial Area Phase II, Ludhiana', avgDeliveryDays: 8, reliability: 86,
    notes: 'Delivers rods and sheets in full truck loads; minimum order ₹25,000.',
  },
  {
    id: 'SUP-3', name: 'Prime Industrial Supplies', contactPerson: 'Imran Shaikh', phone: '+91 98450 77889',
    email: 'hello@primeindustrial.example', address: '22 Lamington Road, Mumbai', avgDeliveryDays: 5, reliability: 91,
    notes: 'Consumables, tooling and plumbing.',
  },
];

interface SeedSpec {
  id: string; name: string; sku: string; category: string; unit: Product['unit'];
  cost: number; sell: number; finalQty: number; adu: number; min: number; safety: number;
  supplierId: string; lead: number; maxPerSale: number;
}

const specs: SeedSpec[] = [
  { id: 'PRD-NUT10', name: 'M10 Nuts', sku: 'FAS-NUT-M10', category: 'Fasteners', unit: 'pcs', cost: 2.5, sell: 4, finalQty: 240, adu: 12, min: 60, safety: 40, supplierId: 'SUP-1', lead: 4, maxPerSale: 6 },
  { id: 'PRD-ROD12', name: 'Steel Rods', sku: 'RAW-ROD-12', category: 'Raw Materials', unit: 'pcs', cost: 420, sell: 520, finalQty: 28, adu: 3, min: 15, safety: 10, supplierId: 'SUP-2', lead: 7, maxPerSale: 3 },
  { id: 'PRD-ALSHT', name: 'Aluminium Sheets', sku: 'RAW-ALU-2MM', category: 'Raw Materials', unit: 'sheets', cost: 850, sell: 1050, finalQty: 14, adu: 1.5, min: 8, safety: 5, supplierId: 'SUP-2', lead: 10, maxPerSale: 2 },
  { id: 'PRD-BLT12', name: 'Bolts', sku: 'FAS-BLT-M12', category: 'Fasteners', unit: 'pcs', cost: 6, sell: 9.5, finalQty: 320, adu: 15, min: 80, safety: 50, supplierId: 'SUP-1', lead: 4, maxPerSale: 8 },
  { id: 'PRD-SCRW', name: 'Screws', sku: 'FAS-SCR-100', category: 'Fasteners', unit: 'packs', cost: 85, sell: 120, finalQty: 46, adu: 4, min: 15, safety: 10, supplierId: 'SUP-1', lead: 3, maxPerSale: 5 },
  { id: 'PRD-WSHR', name: 'Washers', sku: 'FAS-WSH-M10', category: 'Fasteners', unit: 'pcs', cost: 1, sell: 2, finalQty: 0, adu: 10, min: 50, safety: 30, supplierId: 'SUP-1', lead: 4, maxPerSale: 10 },
  { id: 'PRD-DISC', name: 'Cutting Discs', sku: 'ABR-DSC-4IN', category: 'Abrasives', unit: 'pcs', cost: 35, sell: 55, finalQty: 60, adu: 5, min: 20, safety: 15, supplierId: 'SUP-3', lead: 6, maxPerSale: 4 },
  { id: 'PRD-LUBE', name: 'Lubricants', sku: 'CON-LUB-1L', category: 'Consumables', unit: 'litres', cost: 180, sell: 245, finalQty: 15, adu: 2, min: 8, safety: 6, supplierId: 'SUP-3', lead: 5, maxPerSale: 2 },
  { id: 'PRD-DRLB', name: 'Drill Bits', sku: 'TLS-DRL-8MM', category: 'Tools', unit: 'pcs', cost: 60, sell: 95, finalQty: 42, adu: 2.5, min: 12, safety: 8, supplierId: 'SUP-3', lead: 8, maxPerSale: 3 },
  { id: 'PRD-PVC1', name: 'PVC Pipes', sku: 'PLB-PVC-1IN', category: 'Plumbing', unit: 'pcs', cost: 140, sell: 190, finalQty: 65, adu: 4, min: 20, safety: 12, supplierId: 'SUP-3', lead: 5, maxPerSale: 4 },
];

type Ev =
  | { kind: 'sale'; ts: number; qty: number; source: Transaction['source'] }
  | { kind: 'in'; ts: number; qty: number }
  | { kind: 'adj'; ts: number; qty: number; reason: string };

export function createSeedState(now = Date.now()): InventoryState {
  const rand = mulberry32(20261122);
  const today = startOfDay(now);
  const products: Product[] = [];
  const transactions: Transaction[] = [];
  const movements: StockMovement[] = [];
  const purchases: PurchaseRecord[] = [];
  let n = 0;
  const id = (p: string) => `${p}-S${(++n).toString().padStart(5, '0')}`;

  for (const s of specs) {
    const product: Product = {
      id: s.id, name: s.name, sku: s.sku, category: s.category, quantity: s.finalQty, unit: s.unit,
      costPrice: s.cost, sellingPrice: s.sell, minStock: s.min, safetyStock: s.safety, supplierId: s.supplierId,
      leadTimeDays: s.lead, demoDailyEstimate: s.adu, createdAt: today - 45 * DAY_MS,
    };
    products.push(product);

    // Build events for the last 30 days (oldest first). Demand drifts up slightly over the month.
    const events: Ev[] = [];
    for (let d = 30; d >= 0; d--) {
      const dayStart = today - d * DAY_MS;
      const drift = 0.85 + (30 - d) * 0.01;
      const weekend = new Date(dayStart).getDay() === 0 ? 0.5 : 1;
      let remaining = Math.round(s.adu * drift * weekend * (0.6 + rand() * 0.8));
      // Washers sold out 2 days ago — no sales since.
      if (s.id === 'PRD-WSHR' && d <= 1) remaining = 0;
      while (remaining > 0) {
        const qty = Math.min(remaining, 1 + Math.floor(rand() * s.maxPerSale));
        remaining -= qty;
        const ts = dayStart + (9 + rand() * 11) * 3_600_000;
        if (ts >= now) continue;
        events.push({ kind: 'sale', ts, qty, source: 'manual' });
      }
      if (d > 0 && d % (s.lead + 9) === 0) {
        events.push({ kind: 'in', ts: dayStart + 8.5 * 3_600_000, qty: Math.round(s.adu * (s.lead + 12)) });
      }
    }
    if (s.id === 'PRD-ROD12') events.push({ kind: 'adj', ts: today - 12 * DAY_MS + 19 * 3_600_000, qty: -1, reason: 'Damaged during unloading' });
    if (s.id === 'PRD-NUT10') events.push({ kind: 'adj', ts: today - 6 * DAY_MS + 19 * 3_600_000, qty: 5, reason: 'Physical count correction' });

    // Walk backwards from the final quantity so every movement's before/after stock is consistent.
    events.sort((a, b) => b.ts - a.ts);
    let stock = s.finalQty;
    for (const ev of events) {
      if (ev.kind === 'sale') {
        const prev = stock + ev.qty;
        const t: Transaction = {
          id: id('TXN'), productId: s.id, productName: s.name, quantity: ev.qty, unitPrice: s.sell, unitCost: s.cost,
          total: round2(ev.qty * s.sell), timestamp: ev.ts, source: ev.source,
        };
        transactions.push(t);
        movements.push({ id: id('MOV'), productId: s.id, productName: s.name, type: 'out', change: -ev.qty, previousStock: prev, newStock: stock, timestamp: ev.ts, reason: 'Counter sale', source: 'seed', referenceId: t.id });
        stock = prev;
      } else if (ev.kind === 'in') {
        const qty = Math.min(ev.qty, stock);
        if (qty <= 0) continue;
        const prev = stock - qty;
        const po: PurchaseRecord = { id: id('PO'), supplierId: s.supplierId, productId: s.id, productName: s.name, quantity: qty, unitCost: s.cost, total: round2(qty * s.cost), timestamp: ev.ts };
        purchases.push(po);
        movements.push({ id: id('MOV'), productId: s.id, productName: s.name, type: 'in', change: qty, previousStock: prev, newStock: stock, timestamp: ev.ts, reason: 'Supplier delivery', source: 'seed', referenceId: po.id });
        stock = prev;
      } else {
        const prev = stock - ev.qty;
        if (prev < 0) continue;
        movements.push({ id: id('MOV'), productId: s.id, productName: s.name, type: 'adjustment', change: ev.qty, previousStock: prev, newStock: stock, timestamp: ev.ts, reason: ev.reason, source: 'seed' });
        stock = prev;
      }
    }
  }

  const byTimeDesc = <T extends { timestamp: number }>(a: T, b: T) => b.timestamp - a.timestamp;
  return {
    products,
    suppliers,
    transactions: transactions.sort(byTimeDesc),
    movements: movements.sort(byTimeDesc),
    purchases: purchases.sort(byTimeDesc),
    processedKeys: [],
    settings: { businessName: 'Pilot Hardware Store', ownerName: 'Shop Owner', currency: 'INR', planningPeriodDays: 14, forecastWindowDays: 30 },
    seedVersion: SEED_VERSION,
  };
}
