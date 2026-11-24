import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDownToLine, ArrowUpDown, MoreHorizontal, PackageSearch, Pencil, Plus, Search, ShoppingCart, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useInventory } from '../store/inventoryStore';
import { useForecasts } from '../lib/useForecasts';
import { fmtNum, useMoney } from '../lib/format';
import { Button, Card, EmptyState, Input, Select, StatusBadge, StockBar, Td, Th, cx } from '../components/ui';
import { ConfirmModal, ProductFormModal, StockActionModal, type StockAction } from '../components/StockModals';
import { toast } from '../store/toastStore';
import type { Product, StockStatus } from '../domain/types';

type SortKey = 'name' | 'stock-asc' | 'stock-desc' | 'cover' | 'value';

function RowMenu({ onAction }: { onAction: (a: 'sale' | 'in' | 'adjust' | 'edit' | 'delete') => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const item = (a: Parameters<typeof onAction>[0], label: string, Icon: typeof Pencil, danger = false) => (
    <button
      onClick={() => { setOpen(false); onAction(a); }}
      className={cx('flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-canvas', danger ? 'text-crit' : 'text-ink')}
    >
      <Icon size={15} /> {label}
    </button>
  );
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="rounded-md p-1.5 text-ink-3 hover:bg-canvas hover:text-ink" aria-label="Product actions">
        <MoreHorizontal size={17} />
      </button>
      {open && (
        <div className="animate-fade-up absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-[var(--shadow-pop)]">
          {item('sale', 'Record sale', ShoppingCart)}
          {item('in', 'Receive stock', ArrowDownToLine)}
          {item('adjust', 'Adjust inventory', SlidersHorizontal)}
          {item('edit', 'Edit product', Pencil)}
          <div className="my-1 border-t border-line" />
          {item('delete', 'Delete product', Trash2, true)}
        </div>
      )}
    </div>
  );
}

export function Inventory() {
  const products = useInventory((s) => s.products);
  const suppliers = useInventory((s) => s.suppliers);
  const deleteProduct = useInventory((s) => s.deleteProduct);
  const forecasts = useForecasts();
  const money = useMoney();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState<StockStatus | 'all'>((params.get('status') as StockStatus) ?? 'all');
  const [sort, setSort] = useState<SortKey>('name');
  const [stockAction, setStockAction] = useState<{ a: StockAction; id: string } | null>(null);
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Product | null>(null);

  useEffect(() => {
    setQ(params.get('q') ?? '');
    if (params.get('status')) setStatus(params.get('status') as StockStatus);
  }, [params]);

  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category))).sort(), [products]);
  const supplierName = (id: string | null) => suppliers.find((s) => s.id === id)?.name ?? '—';

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = products.filter((p) => {
      if (needle && !`${p.name} ${p.sku} ${p.category}`.toLowerCase().includes(needle)) return false;
      if (category !== 'all' && p.category !== category) return false;
      if (status !== 'all' && forecasts.get(p.id)?.status !== status) return false;
      return true;
    });
    const cover = (p: Product) => forecasts.get(p.id)?.daysUntilStockout ?? Infinity;
    const sorters: Record<SortKey, (a: Product, b: Product) => number> = {
      name: (a, b) => a.name.localeCompare(b.name),
      'stock-asc': (a, b) => a.quantity - b.quantity,
      'stock-desc': (a, b) => b.quantity - a.quantity,
      cover: (a, b) => cover(a) - cover(b),
      value: (a, b) => b.quantity * b.costPrice - a.quantity * a.costPrice,
    };
    return [...list].sort(sorters[sort]);
  }, [products, q, category, status, sort, forecasts]);

  const toggleStockSort = () => setSort((s) => (s === 'stock-asc' ? 'stock-desc' : 'stock-asc'));

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); if (params.get('q')) setParams({}); }}
            placeholder="Search by name, SKU or category"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={category} onChange={(e) => setCategory(e.target.value)} className="w-auto" aria-label="Category">
            <option value="all">All categories</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value as StockStatus | 'all')} className="w-auto" aria-label="Stock status">
            <option value="all">All statuses</option>
            <option value="healthy">Healthy</option>
            <option value="low">Low stock</option>
            <option value="critical">Critical</option>
            <option value="out">Out of stock</option>
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="w-auto" aria-label="Sort">
            <option value="name">Sort: Name</option>
            <option value="stock-asc">Sort: Stock (low → high)</option>
            <option value="stock-desc">Sort: Stock (high → low)</option>
            <option value="cover">Sort: Days of cover</option>
            <option value="value">Sort: Stock value</option>
          </Select>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing(null)}>Add product</Button>
        </div>
      </div>

      <Card pad={false} className="overflow-visible">
        {/* Phone: one card per product */}
        <ul className="divide-y divide-line md:hidden">
          {rows.map((p) => {
            const f = forecasts.get(p.id)!;
            const barMax = Math.max(f.reorderPoint * 2, p.minStock * 2, p.quantity, 1);
            return (
              <li key={p.id} className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{p.name}</div>
                    <div className="truncate text-xs text-ink-3"><span className="font-mono">{p.sku}</span> · {p.category}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <StatusBadge status={f.status} />
                    <RowMenu
                      onAction={(a) => {
                        if (a === 'edit') setEditing(p);
                        else if (a === 'delete') setDeleting(p);
                        else setStockAction({ a, id: p.id });
                      }}
                    />
                  </div>
                </div>
                <div className="mt-2.5 flex items-baseline justify-between text-sm">
                  <span className="tabular"><span className="font-semibold">{fmtNum(p.quantity)}</span> <span className="text-ink-3">{p.unit}</span></span>
                  <span className="tabular text-xs text-ink-3">
                    {f.daysUntilStockout !== null && p.quantity > 0 ? `${f.daysUntilStockout.toFixed(1)} days cover · ` : ''}{money(p.sellingPrice)} each
                  </span>
                </div>
                <div className="mt-1.5"><StockBar value={p.quantity} max={barMax} status={f.status} /></div>
              </li>
            );
          })}
        </ul>
        <div className="hidden overflow-x-auto rounded-t-xl md:block">
          <table className="w-full min-w-[980px]">
            <thead className="border-b border-line bg-canvas/60">
              <tr>
                <Th>Product</Th>
                <Th>Category</Th>
                <Th align="right">
                  <button onClick={toggleStockSort} className="inline-flex items-center gap-1 uppercase hover:text-ink">
                    In stock <ArrowUpDown size={12} />
                  </button>
                </Th>
                <Th className="w-32">Level</Th>
                <Th align="right">Cost</Th>
                <Th align="right">Price</Th>
                <Th align="right">Min / Safety</Th>
                <Th>Supplier</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((p) => {
                const f = forecasts.get(p.id)!;
                const barMax = Math.max(f.reorderPoint * 2, p.minStock * 2, p.quantity, 1);
                return (
                  <tr key={p.id} className="hover:bg-canvas/50">
                    <Td>
                      <div className="font-medium">{p.name}</div>
                      <div className="font-mono text-xs text-ink-3">{p.sku}</div>
                    </Td>
                    <Td className="text-ink-2">{p.category}</Td>
                    <Td align="right">
                      <span className="font-semibold">{fmtNum(p.quantity)}</span> <span className="text-ink-3">{p.unit}</span>
                      {f.daysUntilStockout !== null && p.quantity > 0 && (
                        <div className="text-xs text-ink-3">{f.daysUntilStockout.toFixed(1)} days cover</div>
                      )}
                    </Td>
                    <Td><StockBar value={p.quantity} max={barMax} status={f.status} /></Td>
                    <Td align="right" className="text-ink-2">{money(p.costPrice)}</Td>
                    <Td align="right">{money(p.sellingPrice)}</Td>
                    <Td align="right" className="text-ink-2">{p.minStock} / {p.safetyStock}</Td>
                    <Td className="max-w-[180px]">
                      <div className="truncate text-ink-2">{supplierName(p.supplierId)}</div>
                      <div className="text-xs text-ink-3">{p.leadTimeDays} day lead time</div>
                    </Td>
                    <Td><StatusBadge status={f.status} /></Td>
                    <Td align="right">
                      <RowMenu
                        onAction={(a) => {
                          if (a === 'edit') setEditing(p);
                          else if (a === 'delete') setDeleting(p);
                          else setStockAction({ a, id: p.id });
                        }}
                      />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
          {rows.length === 0 && (
            <EmptyState
              icon={<PackageSearch size={22} />}
              title={products.length ? 'No products match these filters' : 'No products yet'}
              text={products.length ? 'Try clearing the search or filters.' : 'Add your first product, or restore the demo data from Settings.'}
              action={products.length ? <Button onClick={() => { setQ(''); setCategory('all'); setStatus('all'); setParams({}); }}>Clear filters</Button> : <Button variant="primary" onClick={() => setEditing(null)}>Add product</Button>}
            />
          )}
        <div className="border-t border-line px-4 py-2.5 text-xs text-ink-3">
          Showing {rows.length} of {products.length} products · total value {money(rows.reduce((a, p) => a + p.quantity * p.costPrice, 0))} at cost
        </div>
      </Card>

      <StockActionModal action={stockAction?.a ?? null} productId={stockAction?.id} onClose={() => setStockAction(null)} />
      <ProductFormModal open={editing !== undefined} product={editing} onClose={() => setEditing(undefined)} />
      <ConfirmModal
        open={!!deleting}
        title={`Delete ${deleting?.name}?`}
        text="The product is removed from your catalogue and the virtual shop. Its past transactions and stock movements stay in your history."
        confirmLabel="Delete product"
        onConfirm={() => { if (deleting) { deleteProduct(deleting.id); toast.success(`Deleted ${deleting.name}`); } }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
