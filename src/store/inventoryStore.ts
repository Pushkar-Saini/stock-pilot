import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { InventoryState, Settings, Supplier, Transaction } from '../domain/types';
import * as engine from '../domain/inventoryEngine';
import type { EngineResult } from '../domain/inventoryEngine';
import { createSeedState, SEED_VERSION } from '../domain/seed';

export type ActionResult<T = unknown> = { ok: true; value: T } | { ok: false; error: string; code?: string };

interface Actions {
  recordSale: (input: engine.SaleInput) => ActionResult<Transaction>;
  receiveStock: (input: engine.StockInInput) => ActionResult;
  adjustStock: (input: engine.AdjustInput) => ActionResult;
  addProduct: (draft: engine.ProductDraft) => ActionResult;
  updateProduct: (id: string, draft: engine.ProductDraft) => ActionResult;
  deleteProduct: (id: string) => ActionResult;
  saveSupplier: (s: Omit<Supplier, 'id'> & { id?: string }) => ActionResult;
  deleteSupplier: (id: string) => ActionResult;
  updateSettings: (patch: Partial<Settings>) => void;
  restoreDemoData: () => void;
}

export type InventoryStore = InventoryState & Actions;

function pickState(s: InventoryStore): InventoryState {
  return {
    products: s.products, suppliers: s.suppliers, transactions: s.transactions, movements: s.movements,
    purchases: s.purchases, processedKeys: s.processedKeys, settings: s.settings, seedVersion: s.seedVersion,
  };
}

export const useInventory = create<InventoryStore>()(
  persist(
    (set, get) => {
      /** Run an engine operation against the latest state and commit it atomically. */
      function run<T>(op: (state: InventoryState) => EngineResult<T>): ActionResult<T> {
        const res = op(pickState(get()));
        if (!res.ok) return { ok: false, error: res.error, code: res.code };
        set(res.state);
        return { ok: true, value: res.value };
      }
      return {
        ...createSeedState(),
        recordSale: (input) => run((s) => engine.recordSale(s, input)),
        receiveStock: (input) => run((s) => engine.receiveStock(s, input)),
        adjustStock: (input) => run((s) => engine.adjustStock(s, input)),
        addProduct: (draft) => run((s) => engine.addProduct(s, draft)),
        updateProduct: (id, draft) => run((s) => engine.updateProduct(s, id, draft)),
        deleteProduct: (id) => run((s) => engine.deleteProduct(s, id)),
        saveSupplier: (sup) => {
          if (!sup.name.trim()) return { ok: false, error: 'Supplier name is required.' };
          if (!(sup.reliability >= 0 && sup.reliability <= 100)) return { ok: false, error: 'Reliability must be between 0 and 100.' };
          if (!(sup.avgDeliveryDays >= 0)) return { ok: false, error: 'Delivery time must be zero or more days.' };
          const suppliers = get().suppliers;
          if (sup.id) {
            set({ suppliers: suppliers.map((s) => (s.id === sup.id ? ({ ...sup } as Supplier) : s)) });
            return { ok: true, value: sup.id };
          }
          const created = { ...sup, id: engine.makeId('SUP') } as Supplier;
          set({ suppliers: [...suppliers, created] });
          return { ok: true, value: created.id };
        },
        deleteSupplier: (id) => {
          const linked = get().products.filter((p) => p.supplierId === id).length;
          set({
            suppliers: get().suppliers.filter((s) => s.id !== id),
            products: get().products.map((p) => (p.supplierId === id ? { ...p, supplierId: null } : p)),
          });
          return { ok: true, value: linked };
        },
        updateSettings: (patch) => set({ settings: { ...get().settings, ...patch } }),
        restoreDemoData: () => set(createSeedState()),
      };
    },
    {
      name: 'stockpilot-data',
      version: SEED_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => pickState(s),
      migrate: () => createSeedState() as unknown as InventoryStore,
    },
  ),
);
