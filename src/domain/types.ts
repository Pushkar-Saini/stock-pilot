export type Unit = 'pcs' | 'kg' | 'm' | 'sheets' | 'packs' | 'litres' | 'boxes';

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  unit: Unit;
  costPrice: number;
  sellingPrice: number;
  minStock: number;
  safetyStock: number;
  supplierId: string | null;
  leadTimeDays: number;
  /** Fallback daily-demand figure used only when history is too thin. Clearly labelled as a demo estimate. */
  demoDailyEstimate: number;
  createdAt: number;
}

export interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  avgDeliveryDays: number;
  /** 0–100, share of deliveries that arrived on time */
  reliability: number;
  notes: string;
}

export type TransactionSource = 'simulation' | 'manual';

export interface Transaction {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  unitCost: number;
  total: number;
  timestamp: number;
  source: TransactionSource;
}

export type MovementType = 'in' | 'out' | 'adjustment';
export type MovementSource = 'simulation' | 'manual' | 'seed' | 'system';

export interface StockMovement {
  id: string;
  productId: string;
  productName: string;
  type: MovementType;
  /** Signed change applied to stock (+ for in, − for out, ± for adjustments). */
  change: number;
  previousStock: number;
  newStock: number;
  timestamp: number;
  reason: string;
  source: MovementSource;
  referenceId?: string;
}

export interface PurchaseRecord {
  id: string;
  supplierId: string;
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  total: number;
  timestamp: number;
}

export interface Settings {
  businessName: string;
  ownerName: string;
  currency: 'INR' | 'USD' | 'EUR';
  planningPeriodDays: number;
  forecastWindowDays: number;
}

export interface InventoryState {
  products: Product[];
  suppliers: Supplier[];
  transactions: Transaction[];
  movements: StockMovement[];
  purchases: PurchaseRecord[];
  /** Idempotency keys of operations already applied — prevents duplicate transactions. */
  processedKeys: string[];
  settings: Settings;
  seedVersion: number;
}

export type StockStatus = 'healthy' | 'low' | 'critical' | 'out';
