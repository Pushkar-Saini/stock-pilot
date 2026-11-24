import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { ArrowDownRight, ArrowUpRight, Calculator, FlaskConical, Info, Minus } from 'lucide-react';
import { useInventory } from '../store/inventoryStore';
import { useForecasts } from '../lib/useForecasts';
import { dailySeries, DAY_MS, type Forecast } from '../domain/forecasting';
import { fmtDate, fmtNum, fmtShortDay, useMoney } from '../lib/format';
import { Badge, Card, CardHeader, Select, StatusBadge, Td, Th, cx } from '../components/ui';
import { ChartTooltip, axisProps, gridProps } from '../components/charts';
import type { InventoryState, Product } from '../domain/types';

function Trend({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-ink-3">—</span>;
  const flat = Math.abs(pct) < 5;
  const Icon = flat ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cx('inline-flex items-center gap-0.5 tabular text-[13px]', flat ? 'text-ink-3' : pct > 0 ? 'text-ink' : 'text-ink-2')}>
      <Icon size={14} /> {pct > 0 ? '+' : ''}{pct.toFixed(0)}%
    </span>
  );
}

export function Forecasting() {
  const products = useInventory((s) => s.products);
  const transactions = useInventory((s) => s.transactions);
  const settings = useInventory((s) => s.settings);
  const updateSettings = useInventory((s) => s.updateSettings);
  const forecasts = useForecasts();
  const money = useMoney();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('product') ?? products[0]?.id ?? '';
  const selected = products.find((p) => p.id === selectedId) ?? products[0];
  const sf = selected ? forecasts.get(selected.id) : undefined;

  const sorted = useMemo(
    () => [...products].sort((a, b) => (forecasts.get(a.id)?.daysUntilStockout ?? Infinity) - (forecasts.get(b.id)?.daysUntilStockout ?? Infinity)),
    [products, forecasts],
  );
  const reorderTotal = products.reduce((a, p) => {
    const f = forecasts.get(p.id);
    return f?.needsReorder ? a + f.recommendedQty * p.costPrice : a;
  }, 0);
  const needs = products.filter((p) => forecasts.get(p.id)?.needsReorder).length;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      <Card className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex flex-1 items-start gap-3">
          <span className="rounded-lg bg-canvas p-2 text-ink-2"><Calculator size={18} /></span>
          <div className="text-[13px] text-ink-2">
            <p className="font-medium text-ink">How these forecasts are calculated</p>
            <p className="mt-0.5">
              Statistical formulas on your recorded sales, not machine learning. Average daily usage = units sold in the last {settings.forecastWindowDays} days ÷ days of history.
              Reorder point = usage × lead time + safety stock. Recommended order covers lead time + a {settings.planningPeriodDays}-day planning period, plus safety stock, minus stock on hand.
              Products with under 3 days of sales history use a clearly marked <Badge tone="warn">Demo estimate</Badge>.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[13px]">
          <label className="text-ink-2">Planning period</label>
          <Select value={settings.planningPeriodDays} onChange={(e) => updateSettings({ planningPeriodDays: Number(e.target.value) })} className="w-28">
            {[7, 14, 30, 60].map((d) => <option key={d} value={d}>{d} days</option>)}
          </Select>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="py-4"><div className="text-[13px] text-ink-2">Need reordering now</div><div className="tabular mt-1 text-xl font-semibold">{needs} {needs === 1 ? "product" : "products"}</div></Card>
        <Card className="py-4"><div className="text-[13px] text-ink-2">Suggested purchase value</div><div className="tabular mt-1 text-xl font-semibold">{money(reorderTotal)}</div><div className="text-xs text-ink-3">for products at or below ROP</div></Card>
        <Card className="py-4">
          <div className="text-[13px] text-ink-2">Next stockout</div>
          {(() => {
            const next = sorted.find((p) => p.quantity > 0);
            const f = next && forecasts.get(next.id);
            return f?.stockoutDate ? <><div className="mt-1 text-xl font-semibold">{next!.name}</div><div className="text-xs text-ink-3 tabular">{fmtDate(f.stockoutDate)} · {f.daysUntilStockout!.toFixed(1)} days</div></> : <div className="mt-1 text-xl font-semibold">—</div>;
          })()}
        </Card>
        <Card className="py-4"><div className="text-[13px] text-ink-2">Out of stock</div><div className="tabular mt-1 text-xl font-semibold">{products.filter((p) => p.quantity === 0).length} {products.filter((p) => p.quantity === 0).length === 1 ? "product" : "products"}</div></Card>
      </div>

      <Card pad={false} className="overflow-hidden">
        <div className="p-5 pb-3"><CardHeader title="Reorder plan" subtitle="Sorted by soonest stockout. Click a row to see its demand trend." /></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead className="border-y border-line bg-canvas/60">
              <tr>
                <Th>Product</Th><Th align="right">Avg daily usage</Th><Th align="right">7-day trend</Th><Th align="right">Stock</Th><Th align="right">Lead time</Th>
                <Th align="right">Safety</Th><Th align="right">Reorder point</Th><Th align="right">Days left</Th><Th>Est. stockout</Th>
                <Th align="right">Order qty</Th><Th align="right">Order cost</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {sorted.map((p) => {
                const f = forecasts.get(p.id)!;
                return (
                  <tr key={p.id} onClick={() => setParams({ product: p.id })} className={cx('cursor-pointer hover:bg-canvas/60', p.id === selected?.id && 'bg-brand-50/60')}>
                    <Td className="font-medium">{p.name}</Td>
                    <Td align="right">
                      {fmtNum(f.avgDailyUsage, 1)} <span className="text-ink-3">{p.unit}/day</span>
                      {f.isEstimate && <div><Badge tone="warn">Demo estimate</Badge></div>}
                    </Td>
                    <Td align="right"><Trend pct={f.trendPct} /></Td>
                    <Td align="right" className="font-semibold">{p.quantity}</Td>
                    <Td align="right" className="text-ink-2">{p.leadTimeDays} d</Td>
                    <Td align="right" className="text-ink-2">{p.safetyStock}</Td>
                    <Td align="right">{fmtNum(f.reorderPoint, 0)}</Td>
                    <Td align="right" className={cx(f.daysUntilStockout !== null && f.daysUntilStockout <= p.leadTimeDays && 'font-semibold text-crit')}>
                      {p.quantity === 0 ? '0' : f.daysUntilStockout === null ? '∞' : f.daysUntilStockout.toFixed(1)}
                    </Td>
                    <Td className="whitespace-nowrap text-ink-2">{p.quantity === 0 ? 'Now' : f.stockoutDate ? fmtDate(f.stockoutDate) : '—'}</Td>
                    <Td align="right" className={cx(f.needsReorder ? 'font-semibold' : 'text-ink-3')}>{f.recommendedQty > 0 ? fmtNum(f.recommendedQty) : '—'}</Td>
                    <Td align="right" className={cx(!f.needsReorder && 'text-ink-3')}>{f.recommendedQty > 0 ? money(f.recommendedQty * p.costPrice) : '—'}</Td>
                    <Td><StatusBadge status={f.status} /></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {selected && sf && <ProductTrend product={selected} forecast={sf} transactions={transactions} onSelect={(id) => setParams({ product: id })} products={products} />}

      <WhatIf />
    </div>
  );
}

function ProductTrend({ product, forecast, transactions, products, onSelect }: {
  product: Product; forecast: Forecast; transactions: InventoryState['transactions']; products: Product[]; onSelect: (id: string) => void;
}) {
  const history = useMemo(
    () => dailySeries({ transactions } as InventoryState, 30, product.id).map((d) => ({ ...d, label: fmtShortDay(d.day) })),
    [transactions, product.id],
  );
  const projection = useMemo(() => {
    const days = 30;
    const now = Date.now();
    return Array.from({ length: days + 1 }, (_, i) => ({
      label: fmtShortDay(now + i * DAY_MS),
      stock: Math.max(0, product.quantity - forecast.avgDailyUsage * i),
    }));
  }, [product.quantity, forecast.avgDailyUsage]);

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader
          title={`Demand trend · ${product.name}`}
          subtitle={`Units sold per day, last 30 days · average ${fmtNum(forecast.avgDailyUsage, 1)} ${product.unit}/day${forecast.isEstimate ? ' (demo estimate)' : ''}`}
          action={
            <Select value={product.id} onChange={(e) => onSelect(e.target.value)} className="w-44" aria-label="Product">
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          }
        />
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={history} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barCategoryGap="18%">
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={20} />
              <YAxis {...axisProps} allowDecimals={false} />
              <ReferenceLine y={forecast.avgDailyUsage} stroke="#4f5052" strokeDasharray="4 4" label={{ value: 'avg', position: 'insideTopRight', fill: '#4f5052', fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: 'rgba(28,29,31,0.04)' }}
                content={({ active, payload, label }) => (
                  <ChartTooltip active={active} label={label} rows={payload?.length ? [{ color: '#2a78d6', name: 'Units sold', value: fmtNum(Number(payload[0].value)) }] : []} />
                )}
              />
              <Bar dataKey="units" fill="#2a78d6" radius={[4, 4, 0, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      <Card>
        <CardHeader
          title="Projected stock"
          subtitle={`If demand continues at ${fmtNum(forecast.avgDailyUsage, 1)}/day with no new deliveries. Dashed line = reorder point (${fmtNum(forecast.reorderPoint)}).`}
        />
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={projection} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={24} />
              <YAxis {...axisProps} allowDecimals={false} />
              <ReferenceLine y={forecast.reorderPoint} stroke="#c2570c" strokeDasharray="5 4" />
              <ReferenceLine y={product.safetyStock} stroke="#c0262d" strokeDasharray="2 3" />
              <Tooltip
                content={({ active, payload, label }) => (
                  <ChartTooltip active={active} label={label} rows={payload?.length ? [{ color: '#6250d6', name: 'Projected stock', value: `${fmtNum(Number(payload[0].value))} ${product.unit}` }] : []} />
                )}
              />
              <Area type="monotone" dataKey="stock" stroke="#6250d6" strokeWidth={2} fill="#6250d6" fillOpacity={0.08} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-ink-3">
          <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[#6250d6]" /> Projected stock</span>
          <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-warn" /> Reorder point</span>
          <span className="flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dotted border-crit" /> Safety stock</span>
        </div>
      </Card>
    </div>
  );
}

function WhatIf() {
  const products = useInventory((s) => s.products);
  const money = useMoney();
  const [pct, setPct] = useState(30);
  const [scope, setScope] = useState<string>('all');
  const base = useForecasts(1);
  const sim = useForecasts(1 + pct / 100);
  const list = scope === 'all' ? products : products.filter((p) => p.id === scope);

  const agg = (m: Map<string, Forecast>) => {
    let usage = 0, orderQty = 0, cost = 0, atRisk = 0;
    for (const p of list) {
      const f = m.get(p.id)!;
      usage += f.avgDailyUsage * (scope === 'all' ? p.sellingPrice : 1);
      orderQty += f.recommendedQty;
      cost += f.recommendedQty * p.costPrice;
      if (f.daysUntilStockout !== null && f.daysUntilStockout <= p.leadTimeDays) atRisk++;
    }
    return { usage, orderQty, cost, atRisk };
  };
  const a = agg(base);
  const b = agg(sim);
  const single = scope !== 'all' ? products.find((p) => p.id === scope) : undefined;
  const fa = single && base.get(single.id);
  const fb = single && sim.get(single.id);

  const rows: { label: string; cur: string; sim: string; worse?: boolean }[] = single && fa && fb
    ? [
        { label: 'Expected daily consumption', cur: `${fmtNum(fa.avgDailyUsage, 1)} ${single.unit}`, sim: `${fmtNum(fb.avgDailyUsage, 1)} ${single.unit}` },
        { label: 'Days until stockout', cur: fa.daysUntilStockout?.toFixed(1) ?? '∞', sim: fb.daysUntilStockout?.toFixed(1) ?? '∞', worse: (fb.daysUntilStockout ?? 0) < (fa.daysUntilStockout ?? 0) },
        { label: 'Reorder point', cur: fmtNum(fa.reorderPoint), sim: fmtNum(fb.reorderPoint) },
        { label: 'Recommended purchase qty', cur: fmtNum(fa.recommendedQty), sim: fmtNum(fb.recommendedQty) },
        { label: 'Purchase cost', cur: money(fa.recommendedQty * single.costPrice), sim: money(fb.recommendedQty * single.costPrice) },
        { label: 'Status', cur: fa.status, sim: fb.status },
      ]
    : [
        { label: 'Expected daily sales value', cur: money(a.usage), sim: money(b.usage) },
        { label: 'Products stocking out within lead time', cur: String(a.atRisk), sim: String(b.atRisk), worse: b.atRisk > a.atRisk },
        { label: 'Total recommended purchase qty', cur: fmtNum(a.orderQty), sim: fmtNum(b.orderQty) },
        { label: 'Total purchase cost', cur: money(a.cost), sim: money(b.cost) },
      ];

  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><FlaskConical size={17} /> What-if demand simulator</span>}
        subtitle="Change demand and compare the plan side by side. Nothing is saved; this is a scenario only."
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="space-y-5">
          <div>
            <label className="mb-1 block text-[13px] font-medium text-ink-2">Scope</label>
            <Select value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">All products</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </div>
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <label htmlFor="whatif-pct" className="text-[13px] font-medium text-ink-2">Change in daily demand</label>
              <span className="tabular text-lg font-semibold">{pct > 0 ? '+' : ''}{pct}%</span>
            </div>
            <input id="whatif-pct" type="range" min={-50} max={150} step={5} value={pct} onChange={(e) => setPct(Number(e.target.value))} className="w-full accent-[#14532d]" />
            <div className="mt-1 flex justify-between text-[11px] text-ink-3"><span>−50%</span><span>0</span><span>+150%</span></div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[-20, 10, 30, 50, 100].map((v) => (
                <button key={v} onClick={() => setPct(v)} className={cx('rounded-md border px-2 py-0.5 text-xs font-medium', pct === v ? 'border-brand bg-brand text-white' : 'border-line-strong text-ink-2 hover:bg-canvas')}>
                  {v > 0 ? '+' : ''}{v}%
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-lg bg-canvas p-3.5">
            <div className="text-[13px] text-ink-2">Estimated additional expenditure</div>
            <div className={cx('tabular mt-1 text-2xl font-semibold', b.cost - a.cost > 0 ? 'text-ink' : 'text-ok')}>
              {b.cost - a.cost >= 0 ? '+' : '−'}{money(Math.abs(b.cost - a.cost))}
            </div>
            <div className="mt-1 flex items-start gap-1 text-xs text-ink-3"><Info size={12} className="mt-0.5 shrink-0" /> Difference in recommended purchase cost at the {pct > 0 ? 'higher' : 'changed'} demand.</div>
          </div>
        </div>
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full">
            <thead className="bg-canvas/60">
              <tr><Th>Metric</Th><Th align="right">Current demand</Th><Th align="right">Simulated ({pct > 0 ? '+' : ''}{pct}%)</Th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.label}>
                  <Td className="text-ink-2">{r.label}</Td>
                  <Td align="right">{r.label === 'Status' ? <StatusBadge status={r.cur as Forecast['status']} /> : r.cur}</Td>
                  <Td align="right" className={cx('font-semibold', r.worse && 'text-crit')}>{r.label === 'Status' ? <StatusBadge status={r.sim as Forecast['status']} /> : r.sim}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          {scope === 'all' && (
            <div className="border-t border-line">
              <table className="w-full">
                <thead className="bg-canvas/60"><tr><Th>Product</Th><Th align="right">Days left now → simulated</Th><Th align="right">Order qty now → simulated</Th></tr></thead>
                <tbody className="divide-y divide-line">
                  {products.map((p) => {
                    const x = base.get(p.id)!, y = sim.get(p.id)!;
                    return (
                      <tr key={p.id}>
                        <Td>{p.name}</Td>
                        <Td align="right" className="text-ink-2">{x.daysUntilStockout?.toFixed(1) ?? '∞'} → <span className={cx('font-semibold', y.daysUntilStockout !== null && y.daysUntilStockout <= p.leadTimeDays ? 'text-crit' : 'text-ink')}>{y.daysUntilStockout?.toFixed(1) ?? '∞'}</span></Td>
                        <Td align="right" className="text-ink-2">{fmtNum(x.recommendedQty)} → <span className="font-semibold text-ink">{fmtNum(y.recommendedQty)}</span></Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
