import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Gamepad2, Plus, ReceiptText, Search } from 'lucide-react';
import { useInventory } from '../store/inventoryStore';
import { fmtDateTime, fmtNum, useMoney } from '../lib/format';
import { Badge, Button, Card, EmptyState, Input, Segmented, Select, Td, Th, cx } from '../components/ui';
import { StockActionModal, type StockAction } from '../components/StockModals';
import { MovementDot } from './Overview';
import { DAY_MS, startOfDay } from '../domain/forecasting';

type Range = 'today' | '7d' | '30d' | 'all';
const PAGE = 40;

function rangeStart(r: Range): number {
  if (r === 'today') return startOfDay(Date.now());
  if (r === '7d') return Date.now() - 7 * DAY_MS;
  if (r === '30d') return Date.now() - 30 * DAY_MS;
  return 0;
}

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function Sales() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'movements' ? 'movements' : 'transactions';
  const [action, setAction] = useState<StockAction | null>(null);
  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          value={tab}
          onChange={(v) => setParams(v === 'movements' ? { tab: 'movements' } : {})}
          options={[{ value: 'transactions', label: 'Sales transactions' }, { value: 'movements', label: 'Stock movement history' }]}
        />
        <div className="flex gap-2">
          {tab === 'movements' && <Button onClick={() => setAction('in')}>Record stock in</Button>}
          {tab === 'movements' && <Button onClick={() => setAction('adjust')}>Adjust</Button>}
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAction('sale')}>Record sale</Button>
        </div>
      </div>
      {tab === 'transactions' ? <TransactionsTab /> : <MovementsTab />}
      <StockActionModal action={action} onClose={() => setAction(null)} />
    </div>
  );
}

function TransactionsTab() {
  const transactions = useInventory((s) => s.transactions);
  const products = useInventory((s) => s.products);
  const money = useMoney();
  const [range, setRange] = useState<Range>('30d');
  const [source, setSource] = useState<'all' | 'simulation' | 'manual'>('all');
  const [productId, setProductId] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);

  const productOptions = useMemo(() => {
    const m = new Map<string, string>();
    transactions.forEach((t) => m.set(t.productId, t.productName));
    products.forEach((p) => m.set(p.id, p.name));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [transactions, products]);

  const rows = useMemo(() => {
    const from = rangeStart(range);
    const needle = q.trim().toLowerCase();
    return transactions.filter(
      (t) =>
        t.timestamp >= from &&
        (source === 'all' || t.source === source) &&
        (productId === 'all' || t.productId === productId) &&
        (!needle || t.id.toLowerCase().includes(needle) || t.productName.toLowerCase().includes(needle)),
    );
  }, [transactions, range, source, productId, q]);

  const totals = useMemo(() => {
    const revenue = rows.reduce((a, t) => a + t.total, 0);
    const cost = rows.reduce((a, t) => a + t.unitCost * t.quantity, 0);
    return { revenue, profit: revenue - cost, units: rows.reduce((a, t) => a + t.quantity, 0), sim: rows.filter((t) => t.source === 'simulation').length };
  }, [rows]);

  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));

  return (
    <>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          ['Revenue', money(totals.revenue)],
          ['Gross profit', money(totals.profit)],
          ['Transactions', `${fmtNum(rows.length)}`],
          ['Units sold', fmtNum(totals.units)],
        ].map(([l, v]) => (
          <Card key={l} className="py-4">
            <div className="text-[13px] text-ink-2">{l}</div>
            <div className="tabular mt-1 text-xl font-semibold">{v}</div>
            {l === 'Transactions' && <div className="mt-0.5 text-xs text-ink-3">{totals.sim} from the virtual shop</div>}
          </Card>
        ))}
      </div>

      <Card pad={false} className="overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-line p-3 xl:flex-row xl:items-center">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search transaction ID or product" className="pl-9" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented size="sm" value={range} onChange={(v) => { setRange(v); setPage(0); }} options={[
              { value: 'today', label: 'Today' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: 'all', label: 'All' },
            ]} />
            <Select value={source} onChange={(e) => { setSource(e.target.value as typeof source); setPage(0); }} className="w-auto" aria-label="Source">
              <option value="all">All sources</option>
              <option value="simulation">Virtual shop</option>
              <option value="manual">Manual entry</option>
            </Select>
            <Select value={productId} onChange={(e) => { setProductId(e.target.value); setPage(0); }} className="w-auto" aria-label="Product">
              <option value="all">All products</option>
              {productOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </Select>
            <Button
              size="sm"
              icon={<Download size={14} />}
              onClick={() => downloadCsv('stockpilot-transactions.csv', [
                ['Transaction ID', 'Product', 'Quantity', 'Unit price', 'Total', 'Date', 'Source'],
                ...rows.map((t) => [t.id, t.productName, t.quantity, t.unitPrice, t.total, new Date(t.timestamp).toISOString(), t.source]),
              ])}
            >
              CSV
            </Button>
          </div>
        </div>
        <ul className="divide-y divide-line md:hidden">
          {pageRows.map((t) => (
            <li key={t.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium">{t.quantity} × {t.productName}</div>
                  <div className="text-xs text-ink-3">{fmtDateTime(t.timestamp)} · {money(t.unitPrice)} each</div>
                </div>
                <span className="tabular shrink-0 font-semibold">{money(t.total)}</span>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="truncate font-mono text-[11px] text-ink-3">{t.id}</span>
                {t.source === 'simulation' ? <Badge tone="blue"><Gamepad2 size={11} /> Virtual shop</Badge> : <Badge>Manual entry</Badge>}
              </div>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[820px]">
            <thead className="border-b border-line bg-canvas/60">
              <tr>
                <Th>Transaction ID</Th><Th>Product</Th><Th align="right">Qty</Th><Th align="right">Price</Th>
                <Th align="right">Total</Th><Th>Date</Th><Th>Source</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {pageRows.map((t) => (
                <tr key={t.id} className="hover:bg-canvas/50">
                  <Td className="font-mono text-xs text-ink-2">{t.id}</Td>
                  <Td className="font-medium">{t.productName}</Td>
                  <Td align="right">{t.quantity}</Td>
                  <Td align="right" className="text-ink-2">{money(t.unitPrice)}</Td>
                  <Td align="right" className="font-semibold">{money(t.total)}</Td>
                  <Td className="whitespace-nowrap text-ink-2">{fmtDateTime(t.timestamp)}</Td>
                  <Td>{t.source === 'simulation' ? <Badge tone="blue"><Gamepad2 size={11} /> Virtual shop</Badge> : <Badge>Manual entry</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <EmptyState icon={<ReceiptText size={22} />} title="No transactions in this view" text="Change the filters, record a sale, or run the virtual shop." />}
        <Pager page={page} pages={pages} total={rows.length} onPage={setPage} />
      </Card>
    </>
  );
}

function MovementsTab() {
  const movements = useInventory((s) => s.movements);
  const [type, setType] = useState<'all' | 'in' | 'out' | 'adjustment'>('all');
  const [range, setRange] = useState<Range>('30d');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const rows = useMemo(() => {
    const from = rangeStart(range);
    const needle = q.trim().toLowerCase();
    return movements.filter((m) => m.timestamp >= from && (type === 'all' || m.type === type) && (!needle || m.productName.toLowerCase().includes(needle) || m.reason.toLowerCase().includes(needle)));
  }, [movements, type, range, q]);
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);
  const sourceLabel = { simulation: 'Virtual shop', manual: 'Manual', seed: 'Demo history', system: 'System' } as const;

  return (
    <Card pad={false} className="overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-line p-3 xl:flex-row xl:items-center">
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
          <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search product or reason" className="pl-9" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Segmented size="sm" value={type} onChange={(v) => { setType(v); setPage(0); }} options={[
            { value: 'all', label: 'All' }, { value: 'in', label: 'Stock in' }, { value: 'out', label: 'Stock out' }, { value: 'adjustment', label: 'Adjustments' },
          ]} />
          <Segmented size="sm" value={range} onChange={(v) => { setRange(v); setPage(0); }} options={[
            { value: 'today', label: 'Today' }, { value: '7d', label: '7 days' }, { value: '30d', label: '30 days' }, { value: 'all', label: 'All' },
          ]} />
        </div>
      </div>
      <ul className="divide-y divide-line md:hidden">
        {pageRows.map((m) => (
          <li key={m.id} className="flex items-start gap-3 px-4 py-3">
            <MovementDot type={m.type} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{m.productName}</span>
                <span className={cx('tabular shrink-0 font-semibold', m.change > 0 ? 'text-ok' : m.type === 'adjustment' ? 'text-warn' : '')}>{m.change > 0 ? '+' : ''}{m.change}</span>
              </div>
              <div className="truncate text-xs text-ink-3">{m.reason} · {sourceLabel[m.source]}</div>
              <div className="tabular flex justify-between text-xs text-ink-3">
                <span>{fmtDateTime(m.timestamp)}</span>
                <span>{m.previousStock} → {m.newStock}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[880px]">
          <thead className="border-b border-line bg-canvas/60">
            <tr>
              <Th>Type</Th><Th>Product</Th><Th align="right">Quantity</Th><Th align="right">Previous</Th><Th align="right">Updated</Th>
              <Th>Reason</Th><Th>Source</Th><Th>Timestamp</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {pageRows.map((m) => (
              <tr key={m.id} className="hover:bg-canvas/50">
                <Td><MovementDot type={m.type} /></Td>
                <Td className="font-medium">{m.productName}</Td>
                <Td align="right" className={cx('font-semibold', m.change > 0 ? 'text-ok' : m.type === 'adjustment' ? 'text-warn' : '')}>{m.change > 0 ? '+' : ''}{m.change}</Td>
                <Td align="right" className="text-ink-2">{m.previousStock}</Td>
                <Td align="right">{m.newStock}</Td>
                <Td className="max-w-[240px] truncate text-ink-2">{m.reason}</Td>
                <Td><Badge tone={m.source === 'simulation' ? 'blue' : 'neutral'}>{sourceLabel[m.source]}</Badge></Td>
                <Td className="whitespace-nowrap text-ink-2">{fmtDateTime(m.timestamp)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <EmptyState icon={<ReceiptText size={22} />} title="No stock movements in this view" />}
      <Pager page={page} pages={Math.max(1, Math.ceil(rows.length / PAGE))} total={rows.length} onPage={setPage} />
    </Card>
  );
}

function Pager({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5 text-xs text-ink-3">
      <span>{fmtNum(total)} records</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</Button>
        <span className="tabular">Page {page + 1} of {pages}</span>
        <Button size="sm" variant="ghost" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
