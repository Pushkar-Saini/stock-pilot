import { create } from 'zustand';

export type SimStatus = 'idle' | 'running' | 'paused';
export type SimSpeed = 1 | 2 | 4;

export type NoticeKind = 'enter' | 'sale' | 'unavailable' | 'left' | 'reorder' | 'delivery' | 'alert';

export interface SimNotice {
  id: number;
  kind: NoticeKind;
  text: string;
  at: number;
}

/** A purchase order the shopkeeper placed during the simulation, waiting for delivery. */
export interface PendingOrder {
  id: string;
  productId: string;
  productName: string;
  supplierId: string | null;
  supplierName: string;
  quantity: number;
  unitCost: number;
  /** simulation-clock seconds */
  orderedAt: number;
  arriveAt: number;
  status: 'ordered' | 'delivering';
}

interface SimState {
  status: SimStatus;
  speed: SimSpeed;
  autoReorder: boolean;
  customersInside: number;
  customersServed: number;
  customersLeftEmpty: number;
  transactions: number;
  revenue: number;
  ordersPlaced: number;
  deliveriesReceived: number;
  /** Real milliseconds the simulation has been running (pauses excluded). */
  runningMs: number;
  /** Simulation clock in seconds (speed applied). */
  simTime: number;
  notices: SimNotice[];
  orders: PendingOrder[];
  resetToken: number;
  start: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  setSpeed: (s: SimSpeed) => void;
  setAutoReorder: (on: boolean) => void;
  // called by the game bridge
  setInside: (n: number) => void;
  addTime: (realMs: number, simSec: number) => void;
  onSale: (text: string, total: number) => void;
  onLeftEmpty: (text: string) => void;
  notify: (kind: NoticeKind, text: string) => void;
  addOrder: (o: PendingOrder, text: string) => void;
  setOrderStatus: (id: string, status: PendingOrder['status']) => void;
  completeOrder: (id: string, text: string | null) => void;
}

let noticeId = 0;
const MAX_NOTICES = 60;
const pushNotice = (list: SimNotice[], n: Omit<SimNotice, 'id' | 'at'>) =>
  [{ ...n, id: ++noticeId, at: Date.now() }, ...list].slice(0, MAX_NOTICES);

export const useSim = create<SimState>()((set) => ({
  status: 'idle',
  speed: 1,
  autoReorder: true,
  customersInside: 0,
  customersServed: 0,
  customersLeftEmpty: 0,
  transactions: 0,
  revenue: 0,
  ordersPlaced: 0,
  deliveriesReceived: 0,
  runningMs: 0,
  simTime: 0,
  notices: [],
  orders: [],
  resetToken: 0,
  start: () => set({ status: 'running' }),
  pause: () => set((s) => (s.status === 'running' ? { status: 'paused' } : s)),
  resume: () => set((s) => (s.status === 'paused' ? { status: 'running' } : s)),
  reset: () =>
    set((s) => ({
      status: 'idle', customersInside: 0, customersServed: 0, customersLeftEmpty: 0, transactions: 0,
      revenue: 0, ordersPlaced: 0, deliveriesReceived: 0, runningMs: 0, simTime: 0, notices: [], orders: [],
      resetToken: s.resetToken + 1,
    })),
  setSpeed: (speed) => set({ speed }),
  setAutoReorder: (autoReorder) => set({ autoReorder }),
  setInside: (customersInside) => set({ customersInside }),
  addTime: (realMs, simSec) => set((s) => ({ runningMs: s.runningMs + realMs, simTime: s.simTime + simSec })),
  onSale: (text, total) =>
    set((s) => ({
      customersServed: s.customersServed + 1,
      transactions: s.transactions + 1,
      revenue: s.revenue + total,
      notices: pushNotice(s.notices, { kind: 'sale', text }),
    })),
  onLeftEmpty: (text) =>
    set((s) => ({ customersLeftEmpty: s.customersLeftEmpty + 1, notices: pushNotice(s.notices, { kind: 'left', text }) })),
  notify: (kind, text) => set((s) => ({ notices: pushNotice(s.notices, { kind, text }) })),
  addOrder: (o, text) =>
    set((s) => ({ orders: [...s.orders, o], ordersPlaced: s.ordersPlaced + 1, notices: pushNotice(s.notices, { kind: 'reorder', text }) })),
  setOrderStatus: (id, status) => set((s) => ({ orders: s.orders.map((o) => (o.id === id ? { ...o, status } : o)) })),
  completeOrder: (id, text) =>
    set((s) => ({
      orders: s.orders.filter((o) => o.id !== id),
      deliveriesReceived: s.deliveriesReceived + (text ? 1 : 0),
      notices: text ? pushNotice(s.notices, { kind: 'delivery', text }) : s.notices,
    })),
}));
