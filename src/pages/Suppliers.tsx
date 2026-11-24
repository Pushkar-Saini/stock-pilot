import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Mail, MapPin, Pencil, Phone, Plus, ShieldCheck, Trash2, Truck } from 'lucide-react';
import { useInventory } from '../store/inventoryStore';
import { fmtDate, fmtNum, useMoney } from '../lib/format';
import { Button, Card, EmptyState, Field, Input, Modal, Td, Textarea, Th, cx } from '../components/ui';
import { ConfirmModal } from '../components/StockModals';
import { toast } from '../store/toastStore';
import type { Supplier } from '../domain/types';

type Draft = Omit<Supplier, 'id'> & { id?: string };
const blank: Draft = { name: '', contactPerson: '', phone: '', email: '', address: '', avgDeliveryDays: 5, reliability: 90, notes: '' };

function reliabilityTone(r: number) {
  return r >= 90 ? 'text-ok bg-ok' : r >= 80 ? 'text-warn bg-warn' : 'text-crit bg-crit';
}

export function Suppliers() {
  const suppliers = useInventory((s) => s.suppliers);
  const products = useInventory((s) => s.products);
  const purchases = useInventory((s) => s.purchases);
  const deleteSupplier = useInventory((s) => s.deleteSupplier);
  const money = useMoney();
  const [selected, setSelected] = useState<string | null>(suppliers[0]?.id ?? null);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const pick = (id: string) => {
    setSelected(id);
    // on narrow screens the detail panel sits below the list: bring it into view
    if (window.matchMedia('(max-width: 1279px)').matches) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
  };

  useEffect(() => {
    if (selected && !suppliers.some((s) => s.id === selected)) setSelected(suppliers[0]?.id ?? null);
  }, [suppliers, selected]);

  const summary = useMemo(() => {
    const m = new Map<string, { count: number; total: number; last: number | null }>();
    for (const s of suppliers) m.set(s.id, { count: 0, total: 0, last: null });
    for (const p of purchases) {
      const cur = m.get(p.supplierId);
      if (!cur) continue;
      cur.count++;
      cur.total += p.total;
      cur.last = Math.max(cur.last ?? 0, p.timestamp);
    }
    return m;
  }, [suppliers, purchases]);

  const sel = suppliers.find((s) => s.id === selected);
  const selProducts = products.filter((p) => p.supplierId === selected);
  const selPurchases = purchases.filter((p) => p.supplierId === selected).slice(0, 12);

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-2">{suppliers.length} suppliers · {fmtNum(purchases.length)} purchase records</p>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing({ ...blank })}>Add supplier</Button>
      </div>

      {suppliers.length === 0 ? (
        <Card><EmptyState icon={<Truck size={22} />} title="No suppliers yet" text="Add the companies you buy stock from to track lead times and purchases." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <div className="space-y-3">
            {suppliers.map((s) => {
              const sm = summary.get(s.id)!;
              const count = products.filter((p) => p.supplierId === s.id).length;
              return (
                <button
                  key={s.id}
                  onClick={() => pick(s.id)}
                  className={cx(
                    'w-full rounded-xl border bg-surface p-4 text-left shadow-[var(--shadow-card)] transition-colors',
                    selected === s.id ? 'border-brand-600 ring-2 ring-brand-600/10' : 'border-line hover:border-line-strong',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{s.name}</div>
                      <div className="text-[13px] text-ink-3">{s.contactPerson || 'No contact person'} · {count} products</div>
                    </div>
                    <div className="text-right">
                      <div className={cx('tabular text-sm font-semibold', reliabilityTone(s.reliability).split(' ')[0])}>{s.reliability}%</div>
                      <div className="text-[11px] text-ink-3">on time</div>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[13px]">
                    <div><div className="text-ink-3">Delivery</div><div className="tabular font-medium">{s.avgDeliveryDays} days</div></div>
                    <div><div className="text-ink-3">Purchases</div><div className="tabular font-medium">{money(sm.total, true)}</div></div>
                    <div><div className="text-ink-3">Last order</div><div className="tabular font-medium">{sm.last ? fmtDate(sm.last) : '—'}</div></div>
                  </div>
                </button>
              );
            })}
          </div>

          {sel && (
            <div ref={detailRef} className="scroll-mt-20">
            <Card className="animate-fade-up h-fit" key={sel.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{sel.name}</h2>
                  <p className="text-[13px] text-ink-3">{sel.notes || 'No notes'}</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => setEditing({ ...sel })}>Edit</Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setDeleting(sel)} className="text-crit hover:text-crit">Delete</Button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div className="flex items-center gap-2 text-ink-2"><Phone size={14} className="text-ink-3" />{sel.phone || '—'}</div>
                <div className="flex items-center gap-2 text-ink-2"><Mail size={14} className="text-ink-3" />{sel.email || '—'}</div>
                <div className="flex items-center gap-2 text-ink-2"><MapPin size={14} className="text-ink-3" />{sel.address || '—'}</div>
                <div className="flex items-center gap-2 text-ink-2"><Clock size={14} className="text-ink-3" />Average delivery {sel.avgDeliveryDays} days</div>
              </div>
              <div className="mt-4 rounded-lg bg-canvas p-3">
                <div className="mb-1.5 flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-1.5 font-medium"><ShieldCheck size={14} /> Reliability</span>
                  <span className="tabular font-semibold">{sel.reliability}% on-time deliveries</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-line">
                  <div className={cx('h-full rounded-full', reliabilityTone(sel.reliability).split(' ')[1])} style={{ width: `${sel.reliability}%` }} />
                </div>
              </div>

              <h3 className="mb-2 mt-5 text-sm font-semibold">Products supplied</h3>
              {selProducts.length === 0 ? <p className="text-sm text-ink-3">No products linked. Pick this supplier on a product to link it.</p> : (
                <div className="overflow-hidden rounded-lg border border-line">
                  <table className="w-full">
                    <thead className="bg-canvas/60"><tr><Th>Product</Th><Th align="right">Unit cost</Th><Th align="right">In stock</Th><Th align="right">Lead time</Th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {selProducts.map((p) => (
                        <tr key={p.id}><Td className="font-medium">{p.name}</Td><Td align="right">{money(p.costPrice)}</Td><Td align="right">{p.quantity} {p.unit}</Td><Td align="right">{p.leadTimeDays} d</Td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <h3 className="mb-2 mt-5 text-sm font-semibold">Previous purchases</h3>
              {selPurchases.length === 0 ? <p className="text-sm text-ink-3">No purchases recorded yet. Stock-in entries with this supplier appear here.</p> : (
                <div className="overflow-hidden rounded-lg border border-line">
                  <table className="w-full">
                    <thead className="bg-canvas/60"><tr><Th>Date</Th><Th>Product</Th><Th align="right">Qty</Th><Th align="right">Total</Th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {selPurchases.map((p) => (
                        <tr key={p.id}><Td className="text-ink-2">{fmtDate(p.timestamp)}</Td><Td>{p.productName}</Td><Td align="right">{p.quantity}</Td><Td align="right" className="font-medium">{money(p.total)}</Td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
            </div>
          )}
        </div>
      )}

      <SupplierModal draft={editing} onClose={() => setEditing(null)} onSaved={(id) => setSelected(id)} />
      <ConfirmModal
        open={!!deleting}
        title={`Delete ${deleting?.name}?`}
        text="Products from this supplier will be unlinked. Purchase history is kept."
        confirmLabel="Delete supplier"
        onConfirm={() => { if (deleting) { deleteSupplier(deleting.id); toast.success(`Deleted ${deleting.name}`); } }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}

function SupplierModal({ draft, onClose, onSaved }: { draft: Draft | null; onClose: () => void; onSaved: (id: string) => void }) {
  const save = useInventory((s) => s.saveSupplier);
  const [d, setD] = useState<Draft>(blank);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (draft) { setD(draft); setError(null); } }, [draft]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  function submit() {
    const res = save(d);
    if (!res.ok) return setError(res.error);
    toast.success(d.id ? `Saved ${d.name}` : `Added ${d.name}`);
    onSaved(res.value as string);
    onClose();
  }
  return (
    <Modal open={!!draft} onClose={onClose} title={d.id ? 'Edit supplier' : 'Add supplier'} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Save supplier</Button></>}>
      <form className="grid grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Field label="Supplier name" className="col-span-2"><Input value={d.name} onChange={(e) => set('name', e.target.value)} autoFocus /></Field>
        <Field label="Contact person"><Input value={d.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} /></Field>
        <Field label="Phone"><Input value={d.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field label="Email" className="col-span-2"><Input type="email" value={d.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Address" className="col-span-2"><Input value={d.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field label="Average delivery (days)"><Input type="number" min={0} value={d.avgDeliveryDays} onChange={(e) => set('avgDeliveryDays', Number(e.target.value))} /></Field>
        <Field label="Reliability (% on time)"><Input type="number" min={0} max={100} value={d.reliability} onChange={(e) => set('reliability', Number(e.target.value))} /></Field>
        <Field label="Notes" className="col-span-2"><Textarea rows={2} value={d.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        {error && <p className="col-span-2 rounded-lg bg-crit-bg px-3 py-2 text-sm text-crit">{error}</p>}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
