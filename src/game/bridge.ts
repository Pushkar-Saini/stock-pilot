/**
 * The only connection between the Phaser scene and the application.
 * The scene never touches stock numbers directly: it asks this bridge what is
 * available and commits purchases and deliveries through the same inventory
 * engine the dashboard uses.
 */
import { useInventory } from '../store/inventoryStore';
import { useSim, type PendingOrder, type SimSpeed, type SimStatus } from '../store/simStore';
import { forecastAll } from '../domain/forecasting';
import { formatMoney } from '../lib/format';
import type { Product } from '../domain/types';
import { SHELF_SLOTS } from './shopLayout';

export interface ShelfProduct {
  slot: number;
  product: Product;
}

/** Simulation seconds per day of supplier lead time, so deliveries arrive within a demo-friendly wait. */
const SIM_SECONDS_PER_LEAD_DAY = 4;
const MIN_DELIVERY_SECONDS = 10;
const MAX_DELIVERY_SECONDS = 40;

function forecasts() {
  const st = useInventory.getState();
  return forecastAll(st, { windowDays: st.settings.forecastWindowDays, planningPeriodDays: st.settings.planningPeriodDays });
}

function statusOf(productId: string) {
  const st = useInventory.getState();
  const p = st.products.find((x) => x.id === productId);
  if (!p) return undefined;
  return forecastAll({ ...st, products: [p] }, { windowDays: st.settings.forecastWindowDays, planningPeriodDays: st.settings.planningPeriodDays }).get(productId)?.status;
}

const money = (n: number) => formatMoney(n, useInventory.getState().settings.currency);

/** Quantities picked up by customers who have not paid yet. */
const reservations = new Map<string, number>();
let runId = Date.now().toString(36);
let orderSeq = 0;

export const shopBridge = {
  /** Products currently stocked on shelves, in slot order. */
  shelfProducts(): ShelfProduct[] {
    return useInventory.getState().products.slice(0, SHELF_SLOTS.length).map((product, slot) => ({ slot, product }));
  },

  product(id: string): Product | undefined {
    return useInventory.getState().products.find((p) => p.id === id);
  },

  /** Stock that is on the shelf and not already in another customer's basket. */
  available(productId: string): number {
    const p = this.product(productId);
    if (!p) return 0;
    return Math.max(0, p.quantity - (reservations.get(productId) ?? 0));
  },

  /** Put items in a basket. Returns how many were actually taken (never more than available). */
  reserve(productId: string, wanted: number): number {
    const take = Math.min(Math.max(0, Math.floor(wanted)), this.available(productId));
    if (take > 0) reservations.set(productId, (reservations.get(productId) ?? 0) + take);
    return take;
  },

  release(productId: string, qty: number) {
    const left = (reservations.get(productId) ?? 0) - qty;
    if (left > 0) reservations.set(productId, left);
    else reservations.delete(productId);
  },

  /**
   * Pay at the counter. Uses an idempotency key per customer so a purchase can
   * never be recorded twice, even if this is called again for the same customer.
   */
  checkout(customerId: number, customerName: string, productId: string, qty: number) {
    this.release(productId, qty);
    const before = statusOf(productId);
    const res = useInventory.getState().recordSale({
      productId,
      quantity: qty,
      source: 'simulation',
      idempotencyKey: `sim-${runId}-${customerId}`,
    });
    const sim = useSim.getState();
    if (res.ok) {
      const t = res.value;
      sim.onSale(`${customerName} bought ${t.quantity} × ${t.productName} · ${money(t.total)}`, t.total);
      const after = statusOf(productId);
      if (after && after !== before && after !== 'healthy') {
        const p = this.product(productId)!;
        sim.notify('alert', after === 'out' ? `${p.name} is now out of stock` : `${p.name} is ${after === 'critical' ? 'critically low' : 'low'}: ${p.quantity} ${p.unit} left`);
      }
    }
    return res;
  },

  customerEntered(name: string, productName: string) {
    useSim.getState().notify('enter', `${name} came in looking for ${productName}`);
  },

  leftEmptyHanded(name: string, productName: string, reason: 'out' | 'gone') {
    useSim.getState().onLeftEmpty(
      reason === 'out'
        ? `${name} left without buying: ${productName} is out of stock`
        : `${name} left without buying: ${productName} sold out before checkout`,
    );
  },

  notifyAlternative(name: string, wanted: string, chosen: string) {
    useSim.getState().notify('unavailable', `${name} couldn't find ${wanted}, picked ${chosen} instead`);
  },

  /* ----------------------------- reordering ----------------------------- */

  /**
   * The shopkeeper checks the shelves: any product at or below its reorder point
   * (and not already on order) gets a purchase order for the recommended quantity.
   * Returns the orders placed now.
   */
  reorderCheck(simTime: number): PendingOrder[] {
    const sim = useSim.getState();
    if (!sim.autoReorder) return [];
    const st = useInventory.getState();
    const fc = forecasts();
    const placed: PendingOrder[] = [];
    for (const { product: p } of this.shelfProducts()) {
      const f = fc.get(p.id);
      if (!f || !(f.needsReorder || p.quantity === 0)) continue;
      if (useSim.getState().orders.some((o) => o.productId === p.id)) continue;
      const qty = Math.max(f.recommendedQty, p.minStock, 1);
      const supplier = st.suppliers.find((s) => s.id === p.supplierId);
      const eta = Math.min(MAX_DELIVERY_SECONDS, Math.max(MIN_DELIVERY_SECONDS, p.leadTimeDays * SIM_SECONDS_PER_LEAD_DAY));
      const order: PendingOrder = {
        id: `PO-${runId}-${++orderSeq}`,
        productId: p.id,
        productName: p.name,
        supplierId: supplier?.id ?? null,
        supplierName: supplier?.name ?? 'local supplier',
        quantity: qty,
        unitCost: p.costPrice,
        orderedAt: simTime,
        arriveAt: simTime + eta,
        status: 'ordered',
      };
      useSim.getState().addOrder(
        order,
        `Shopkeeper reordered ${qty} ${p.unit} of ${p.name} from ${order.supplierName} (${money(qty * p.costPrice)}), ${p.quantity} left`,
      );
      placed.push(order);
    }
    return placed;
  },

  /** Orders whose delivery time has come and that nobody is delivering yet. */
  dueOrders(simTime: number): PendingOrder[] {
    return useSim.getState().orders.filter((o) => o.status === 'ordered' && o.arriveAt <= simTime);
  },

  startDelivery(orderId: string) {
    const o = useSim.getState().orders.find((x) => x.id === orderId);
    useSim.getState().setOrderStatus(orderId, 'delivering');
    if (o) useSim.getState().notify('delivery', `Delivery van arrived from ${o.supplierName} with ${o.quantity} × ${o.productName}`);
  },

  /** Put delivered stock on the shelf: a stock-in movement + purchase record via the inventory engine. */
  completeDelivery(orderId: string) {
    const o = useSim.getState().orders.find((x) => x.id === orderId);
    if (!o) return null;
    const res = useInventory.getState().receiveStock({
      productId: o.productId,
      quantity: o.quantity,
      supplierId: o.supplierId,
      unitCost: o.unitCost,
      reason: 'Auto-reorder delivery (virtual shop)',
      source: 'simulation',
      idempotencyKey: o.id,
    });
    const p = this.product(o.productId);
    useSim.getState().completeOrder(
      o.id,
      res.ok ? `Restocked ${o.productName}: +${o.quantity} ${p?.unit ?? ''}, now ${p?.quantity ?? '?'} on the shelf` : null,
    );
    return res.ok ? o : null;
  },

  cancelOrder(orderId: string) {
    useSim.getState().completeOrder(orderId, null);
  },

  /* ------------------------------ sim state ------------------------------ */

  sim(): { status: SimStatus; speed: SimSpeed; resetToken: number; simTime: number } {
    const s = useSim.getState();
    return { status: s.status, speed: s.speed, resetToken: s.resetToken, simTime: s.simTime };
  },

  setInside(n: number) {
    if (useSim.getState().customersInside !== n) useSim.getState().setInside(n);
  },

  addTime(realMs: number, simSec: number) {
    useSim.getState().addTime(realMs, simSec);
  },

  /** Clear baskets when the simulation is reset (nothing was paid, so stock is untouched). */
  resetRun() {
    reservations.clear();
    runId = Date.now().toString(36);
  },

  onInventoryChange(cb: () => void) {
    return useInventory.subscribe((s, prev) => {
      if (s.products !== prev.products) cb();
    });
  },
};
