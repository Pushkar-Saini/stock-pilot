import { useEffect, useMemo, useState } from 'react';
import type { Product, Unit } from '../domain/types';
import type { ProductDraft } from '../domain/inventoryEngine';
import { useInventory } from '../store/inventoryStore';
import { toast } from '../store/toastStore';
import { useMoney } from '../lib/format';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';

export type StockAction = 'sale' | 'in' | 'adjust';

function ProductPicker({ value, onChange, products }: { value: string; onChange: (id: string) => void; products: Product[] }) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      {products.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name} — {p.quantity} {p.unit} in stock
        </option>
      ))}
    </Select>
  );
}

/** One modal for the three stock operations, all routed through the shared inventory engine. */
export function StockActionModal({ action, productId, onClose }: { action: StockAction | null; productId?: string; onClose: () => void }) {
  const products = useInventory((s) => s.products);
  const suppliers = useInventory((s) => s.suppliers);
  const recordSale = useInventory((s) => s.recordSale);
  const receiveStock = useInventory((s) => s.receiveStock);
  const adjustStock = useInventory((s) => s.adjustStock);
  const money = useMoney();
  const [pid, setPid] = useState(productId ?? products[0]?.id ?? '');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const product = products.find((p) => p.id === pid);
  useEffect(() => {
    if (!action) return;
    const initial = productId ?? products[0]?.id ?? '';
    setPid(initial);
    setQty('');
    setReason('');
    setError(null);
    setBusy(false);
  }, [action, productId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!product) return;
    setPrice(String(action === 'in' ? product.costPrice : product.sellingPrice));
    setSupplierId(product.supplierId ?? '');
    if (action === 'adjust') setQty(String(product.quantity));
  }, [pid, action]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!action) return null;
  const title = action === 'sale' ? 'Record sale' : action === 'in' ? 'Record received stock' : 'Adjust inventory';
  const q = Number(qty);
  const p = Number(price);

  function submit() {
    if (!product || busy) return;
    setBusy(true); // guards against double-submit creating duplicate entries
    let res;
    if (action === 'sale') {
      res = recordSale({ productId: product.id, quantity: q, unitPrice: p, source: 'manual', reason: reason || undefined });
    } else if (action === 'in') {
      res = receiveStock({ productId: product.id, quantity: q, unitCost: p, supplierId: supplierId || null, reason: reason || 'Stock received' });
    } else {
      res = adjustStock({ productId: product.id, countedQuantity: q, reason });
    }
    if (!res.ok) {
      setError(res.error);
      setBusy(false);
      return;
    }
    toast.success(
      action === 'sale' ? `Sold ${q} × ${product.name}` : action === 'in' ? `Received ${q} ${product.unit} of ${product.name}` : `${product.name} adjusted to ${q}`,
    );
    onClose();
  }

  const preview = product && Number.isFinite(q) && qty !== ''
    ? action === 'sale' ? product.quantity - q : action === 'in' ? product.quantity + q : q
    : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!product || qty === '' || busy}>
            {action === 'sale' ? 'Record sale' : action === 'in' ? 'Add stock' : 'Save adjustment'}
          </Button>
        </>
      }
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Product">
          <ProductPicker value={pid} onChange={setPid} products={products} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={action === 'adjust' ? 'Counted quantity' : 'Quantity'} hint={product ? `Unit: ${product.unit}` : undefined}>
            <Input type="number" min={0} step={1} value={qty} onChange={(e) => { setQty(e.target.value); setError(null); }} autoFocus />
          </Field>
          {action !== 'adjust' && (
            <Field label={action === 'sale' ? 'Selling price / unit' : 'Cost price / unit'}>
              <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </Field>
          )}
        </div>
        {action === 'in' && (
          <Field label="Supplier">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— No supplier —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label={action === 'adjust' ? 'Reason (required)' : 'Note (optional)'}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={action === 'adjust' ? 'e.g. Physical count, damaged items' : ''} />
        </Field>
        {product && preview !== null && (
          <div className="flex items-center justify-between rounded-lg bg-canvas px-3 py-2.5 text-sm">
            <span className="text-ink-2">Stock after this entry</span>
            <span className="tabular font-semibold">
              {product.quantity} → <span className={preview < 0 ? 'text-crit' : ''}>{preview}</span> {product.unit}
              {action !== 'adjust' && Number.isFinite(q * p) && q > 0 && <span className="ml-2 font-normal text-ink-3">({money(q * p)})</span>}
            </span>
          </div>
        )}
        {error && <p className="rounded-lg bg-crit-bg px-3 py-2 text-sm text-crit">{error}</p>}
      </form>
    </Modal>
  );
}

const UNITS: Unit[] = ['pcs', 'kg', 'm', 'sheets', 'packs', 'litres', 'boxes'];

export function ProductFormModal({ open, product, onClose }: { open: boolean; product?: Product | null; onClose: () => void }) {
  const suppliers = useInventory((s) => s.suppliers);
  const products = useInventory((s) => s.products);
  const addProduct = useInventory((s) => s.addProduct);
  const updateProduct = useInventory((s) => s.updateProduct);
  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category))).sort(), [products]);
  const blank: ProductDraft = {
    name: '', sku: '', category: '', quantity: 0, unit: 'pcs', costPrice: 0, sellingPrice: 0, minStock: 10,
    safetyStock: 5, supplierId: suppliers[0]?.id ?? null, leadTimeDays: 5, demoDailyEstimate: 1,
  };
  const [d, setD] = useState<ProductDraft>(blank);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (product) {
      const { id: _id, createdAt: _c, ...rest } = product;
      void _id; void _c;
      setD(rest);
    } else setD(blank);
  }, [open, product]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof ProductDraft>(k: K, v: ProductDraft[K]) => { setD((x) => ({ ...x, [k]: v })); setError(null); };
  const num = (k: keyof ProductDraft) => (e: React.ChangeEvent<HTMLInputElement>) => set(k, (e.target.value === '' ? NaN : Number(e.target.value)) as never);

  function save() {
    const res = product ? updateProduct(product.id, d) : addProduct(d);
    if (!res.ok) return setError(res.error);
    toast.success(product ? `Saved ${d.name}` : `Added ${d.name}`);
    onClose();
  }

  const margin = d.sellingPrice > 0 ? ((d.sellingPrice - d.costPrice) / d.sellingPrice) * 100 : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={product ? `Edit ${product.name}` : 'Add product'}
      width="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>{product ? 'Save changes' : 'Add product'}</Button>
        </>
      }
    >
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-6" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <Field label="Product name" className="sm:col-span-4">
          <Input value={d.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. M8 Hex Bolts" autoFocus />
        </Field>
        <Field label="SKU" className="sm:col-span-2">
          <Input value={d.sku} onChange={(e) => set('sku', e.target.value.toUpperCase())} placeholder="FAS-BLT-M8" />
        </Field>
        <Field label="Category" className="sm:col-span-3">
          <Input list="sp-categories" value={d.category} onChange={(e) => set('category', e.target.value)} placeholder="Fasteners" />
          <datalist id="sp-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
        <Field label="Unit" className="sm:col-span-3">
          <Select value={d.unit} onChange={(e) => set('unit', e.target.value as Unit)}>
            {UNITS.map((u) => <option key={u}>{u}</option>)}
          </Select>
        </Field>
        <Field label="Current quantity" className="sm:col-span-2" hint={product ? 'Changes are logged as an adjustment' : undefined}>
          <Input type="number" min={0} value={Number.isNaN(d.quantity) ? '' : d.quantity} onChange={num('quantity')} />
        </Field>
        <Field label="Cost price" className="sm:col-span-2">
          <Input type="number" min={0} step="0.01" value={Number.isNaN(d.costPrice) ? '' : d.costPrice} onChange={num('costPrice')} />
        </Field>
        <Field label="Selling price" className="sm:col-span-2" hint={d.sellingPrice > 0 ? `Margin ${margin.toFixed(0)}%` : undefined}>
          <Input type="number" min={0} step="0.01" value={Number.isNaN(d.sellingPrice) ? '' : d.sellingPrice} onChange={num('sellingPrice')} />
        </Field>
        <Field label="Minimum stock level" className="sm:col-span-2">
          <Input type="number" min={0} value={Number.isNaN(d.minStock) ? '' : d.minStock} onChange={num('minStock')} />
        </Field>
        <Field label="Safety stock" className="sm:col-span-2">
          <Input type="number" min={0} value={Number.isNaN(d.safetyStock) ? '' : d.safetyStock} onChange={num('safetyStock')} />
        </Field>
        <Field label="Supplier lead time (days)" className="sm:col-span-2">
          <Input type="number" min={0} value={Number.isNaN(d.leadTimeDays) ? '' : d.leadTimeDays} onChange={num('leadTimeDays')} />
        </Field>
        <Field label="Supplier" className="sm:col-span-4">
          <Select value={d.supplierId ?? ''} onChange={(e) => set('supplierId', e.target.value || null)}>
            <option value="">— No supplier —</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Est. daily demand" className="sm:col-span-2" hint="Demo estimate until real sales exist">
          <Input type="number" min={0} step="0.1" value={Number.isNaN(d.demoDailyEstimate) ? '' : d.demoDailyEstimate} onChange={num('demoDailyEstimate')} />
        </Field>
        {error && <p className="rounded-lg bg-crit-bg px-3 py-2 text-sm text-crit sm:col-span-6">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function ConfirmModal({ open, title, text, confirmLabel, onConfirm, onClose }: {
  open: boolean; title: string; text: string; confirmLabel: string; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={() => { onConfirm(); onClose(); }}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="text-sm text-ink-2">{text}</p>
    </Modal>
  );
}

export { Textarea };
