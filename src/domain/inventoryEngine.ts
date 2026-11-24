/**
 * Central inventory engine.
 *
 * Every stock change in StockPilot — a virtual-shop purchase, a manual sale on the
 * dashboard, a delivery, a physical-count correction — goes through these pure
 * functions. They take the current state and return a new state (or a failure),
 * so both the Phaser simulation and the React dashboard share one source of truth.
 */
import type {
  InventoryState,
  MovementSource,
  Product,
  PurchaseRecord,
  StockMovement,
  Transaction,
  TransactionSource,
} from './types';

export type EngineResult<T> =
  | { ok: true; state: InventoryState; value: T }
  | { ok: false; state: InventoryState; error: string; code: EngineErrorCode };

export type EngineErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_QUANTITY'
  | 'INSUFFICIENT_STOCK'
  | 'OUT_OF_STOCK'
  | 'DUPLICATE'
  | 'INVALID_INPUT';

const MAX_KEYS = 5000;

let counter = 0;
export function makeId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}-${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
}

function fail<T>(state: InventoryState, code: EngineErrorCode, error: string): EngineResult<T> {
  return { ok: false, state, error, code };
}

function rememberKey(keys: string[], key?: string): string[] {
  if (!key) return keys;
  const next = [...keys, key];
  return next.length > MAX_KEYS ? next.slice(next.length - MAX_KEYS) : next;
}

function isWholePositive(n: number): boolean {
  return Number.isFinite(n) && Number.isInteger(n) && n > 0;
}

function replaceProduct(products: Product[], updated: Product): Product[] {
  return products.map((p) => (p.id === updated.id ? updated : p));
}

export interface SaleInput {
  productId: string;
  quantity: number;
  source: TransactionSource;
  /** Optional override; defaults to the product's selling price. */
  unitPrice?: number;
  /** Idempotency key. A key that was already processed is rejected, never applied twice. */
  idempotencyKey?: string;
  timestamp?: number;
  reason?: string;
}

/** Record a sale: creates exactly one transaction and one stock-out movement. */
export function recordSale(state: InventoryState, input: SaleInput): EngineResult<Transaction> {
  if (input.idempotencyKey && state.processedKeys.includes(input.idempotencyKey)) {
    return fail(state, 'DUPLICATE', 'This sale was already recorded.');
  }
  const product = state.products.find((p) => p.id === input.productId);
  if (!product) return fail(state, 'NOT_FOUND', 'Product not found.');
  if (!isWholePositive(input.quantity)) return fail(state, 'INVALID_QUANTITY', 'Quantity must be a whole number above zero.');
  if (product.quantity <= 0) return fail(state, 'OUT_OF_STOCK', `${product.name} is out of stock.`);
  if (input.quantity > product.quantity) {
    return fail(state, 'INSUFFICIENT_STOCK', `Only ${product.quantity} ${product.unit} of ${product.name} available.`);
  }

  const ts = input.timestamp ?? Date.now();
  const unitPrice = input.unitPrice ?? product.sellingPrice;
  const newQty = product.quantity - input.quantity;
  const txn: Transaction = {
    id: makeId('TXN'),
    productId: product.id,
    productName: product.name,
    quantity: input.quantity,
    unitPrice,
    unitCost: product.costPrice,
    total: round2(unitPrice * input.quantity),
    timestamp: ts,
    source: input.source,
  };
  const movement: StockMovement = {
    id: makeId('MOV'),
    productId: product.id,
    productName: product.name,
    type: 'out',
    change: -input.quantity,
    previousStock: product.quantity,
    newStock: newQty,
    timestamp: ts,
    reason: input.reason ?? (input.source === 'simulation' ? 'Virtual shop sale' : 'Manual sale'),
    source: input.source,
    referenceId: txn.id,
  };

  return {
    ok: true,
    value: txn,
    state: {
      ...state,
      products: replaceProduct(state.products, { ...product, quantity: newQty }),
      transactions: [txn, ...state.transactions],
      movements: [movement, ...state.movements],
      processedKeys: rememberKey(state.processedKeys, input.idempotencyKey),
    },
  };
}

export interface StockInInput {
  productId: string;
  quantity: number;
  supplierId?: string | null;
  unitCost?: number;
  reason?: string;
  source?: MovementSource;
  idempotencyKey?: string;
  timestamp?: number;
}

/** Record received stock (delivery). Logs a stock-in movement and, with a supplier, a purchase record. */
export function receiveStock(state: InventoryState, input: StockInInput): EngineResult<StockMovement> {
  if (input.idempotencyKey && state.processedKeys.includes(input.idempotencyKey)) {
    return fail(state, 'DUPLICATE', 'This delivery was already recorded.');
  }
  const product = state.products.find((p) => p.id === input.productId);
  if (!product) return fail(state, 'NOT_FOUND', 'Product not found.');
  if (!isWholePositive(input.quantity)) return fail(state, 'INVALID_QUANTITY', 'Quantity must be a whole number above zero.');

  const ts = input.timestamp ?? Date.now();
  const newQty = product.quantity + input.quantity;
  const supplierId = input.supplierId === undefined ? product.supplierId : input.supplierId;
  const unitCost = input.unitCost ?? product.costPrice;

  let purchases = state.purchases;
  let purchaseId: string | undefined;
  if (supplierId) {
    const purchase: PurchaseRecord = {
      id: makeId('PO'),
      supplierId,
      productId: product.id,
      productName: product.name,
      quantity: input.quantity,
      unitCost,
      total: round2(unitCost * input.quantity),
      timestamp: ts,
    };
    purchaseId = purchase.id;
    purchases = [purchase, ...purchases];
  }

  const movement: StockMovement = {
    id: makeId('MOV'),
    productId: product.id,
    productName: product.name,
    type: 'in',
    change: input.quantity,
    previousStock: product.quantity,
    newStock: newQty,
    timestamp: ts,
    reason: input.reason || 'Stock received',
    source: input.source ?? 'manual',
    referenceId: purchaseId,
  };

  return {
    ok: true,
    value: movement,
    state: {
      ...state,
      products: replaceProduct(state.products, { ...product, quantity: newQty }),
      movements: [movement, ...state.movements],
      purchases,
      processedKeys: rememberKey(state.processedKeys, input.idempotencyKey),
    },
  };
}

export interface AdjustInput {
  productId: string;
  /** The physically counted quantity. */
  countedQuantity: number;
  reason: string;
  source?: MovementSource;
  timestamp?: number;
}

/** Set stock to a counted physical quantity, logging the difference as an adjustment. */
export function adjustStock(state: InventoryState, input: AdjustInput): EngineResult<StockMovement> {
  const product = state.products.find((p) => p.id === input.productId);
  if (!product) return fail(state, 'NOT_FOUND', 'Product not found.');
  const counted = input.countedQuantity;
  if (!Number.isFinite(counted) || !Number.isInteger(counted) || counted < 0) {
    return fail(state, 'INVALID_QUANTITY', 'Counted quantity must be a whole number, zero or more.');
  }
  if (counted === product.quantity) return fail(state, 'INVALID_QUANTITY', 'Counted quantity matches recorded stock — nothing to adjust.');
  if (!input.reason.trim()) return fail(state, 'INVALID_INPUT', 'Please give a reason for the adjustment.');

  const movement: StockMovement = {
    id: makeId('MOV'),
    productId: product.id,
    productName: product.name,
    type: 'adjustment',
    change: counted - product.quantity,
    previousStock: product.quantity,
    newStock: counted,
    timestamp: input.timestamp ?? Date.now(),
    reason: input.reason.trim(),
    source: input.source ?? 'manual',
  };
  return {
    ok: true,
    value: movement,
    state: {
      ...state,
      products: replaceProduct(state.products, { ...product, quantity: counted }),
      movements: [movement, ...state.movements],
    },
  };
}

export type ProductDraft = Omit<Product, 'id' | 'createdAt'>;

export function validateProduct(state: InventoryState, draft: ProductDraft, editingId?: string): string | null {
  if (!draft.name.trim()) return 'Product name is required.';
  if (!draft.sku.trim()) return 'SKU is required.';
  const skuTaken = state.products.some((p) => p.sku.toLowerCase() === draft.sku.trim().toLowerCase() && p.id !== editingId);
  if (skuTaken) return 'Another product already uses this SKU.';
  const nums: [string, number][] = [
    ['Quantity', draft.quantity],
    ['Cost price', draft.costPrice],
    ['Selling price', draft.sellingPrice],
    ['Minimum stock', draft.minStock],
    ['Safety stock', draft.safetyStock],
    ['Lead time', draft.leadTimeDays],
  ];
  for (const [label, v] of nums) {
    if (!Number.isFinite(v) || v < 0) return `${label} must be zero or more.`;
  }
  if (!Number.isInteger(draft.quantity)) return 'Quantity must be a whole number.';
  return null;
}

export function addProduct(state: InventoryState, draft: ProductDraft): EngineResult<Product> {
  const err = validateProduct(state, draft);
  if (err) return fail(state, 'INVALID_INPUT', err);
  const product: Product = { ...draft, name: draft.name.trim(), sku: draft.sku.trim(), id: makeId('PRD'), createdAt: Date.now() };
  const movements = product.quantity > 0
    ? [{
        id: makeId('MOV'), productId: product.id, productName: product.name, type: 'in' as const,
        change: product.quantity, previousStock: 0, newStock: product.quantity, timestamp: Date.now(),
        reason: 'Opening stock', source: 'manual' as const,
      }, ...state.movements]
    : state.movements;
  return { ok: true, value: product, state: { ...state, products: [...state.products, product], movements } };
}

/** Edit product details. Quantity changes are routed through an adjustment so history stays truthful. */
export function updateProduct(state: InventoryState, id: string, draft: ProductDraft): EngineResult<Product> {
  const existing = state.products.find((p) => p.id === id);
  if (!existing) return fail(state, 'NOT_FOUND', 'Product not found.');
  const err = validateProduct(state, draft, id);
  if (err) return fail(state, 'INVALID_INPUT', err);
  let next: InventoryState = state;
  if (draft.quantity !== existing.quantity) {
    const adj = adjustStock(state, { productId: id, countedQuantity: draft.quantity, reason: 'Quantity edited on product form' });
    if (!adj.ok) return adj as EngineResult<Product>;
    next = adj.state;
  }
  const updated: Product = { ...existing, ...draft, name: draft.name.trim(), sku: draft.sku.trim(), quantity: draft.quantity };
  return { ok: true, value: updated, state: { ...next, products: replaceProduct(next.products, updated) } };
}

export function deleteProduct(state: InventoryState, id: string): EngineResult<Product> {
  const existing = state.products.find((p) => p.id === id);
  if (!existing) return fail(state, 'NOT_FOUND', 'Product not found.');
  // History (transactions, movements) is kept for reporting; only the catalogue entry is removed.
  return { ok: true, value: existing, state: { ...state, products: state.products.filter((p) => p.id !== id) } };
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
