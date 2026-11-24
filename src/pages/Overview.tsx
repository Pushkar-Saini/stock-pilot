import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  AlertTriangle, ArrowDownToLine, ArrowRight, Boxes, CircleSlash, Gamepad2, IndianRupee, PackageMinus, ReceiptText, ShoppingCart, SlidersHorizontal,
} from 'lucide-react';
import { useInventory } from '../store/inventoryStore';
import { useForecasts } from '../lib/useForecasts';
import { dailySeries, DAY_MS, startOfDay } from '../domain/forecasting';
import { fmtNum, fmtShortDay, relativeTime, useMoney } from '../lib/format';
import { Badge, Button, Card, CardHeader, StatusBadge, cx } from '../components/ui';
import { ChartTooltip, axisProps, gridProps } from '../components/charts';
import { StockActionModal, type StockAction } from '../components/StockModals';
import { useSim } from '../store/simStore';
import type { InventoryState } from '../domain/types';

function Kpi({ label, value, sub, icon, tone = 'neutral', to }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; tone?: 'neutral' | 'warn' | 'crit'; to?: string;
}) {
  const body = (
    <Card className={cx('h-full transition-colors', to && 'hover:border-line-strong')}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-ink-2">{label}</span>
        <span className={cx('rounded-md p-1.5', tone === 'warn' ? 'bg-warn-bg text-warn' : tone === 'crit' ? 'bg-crit-bg text-crit' : 'bg-canvas text-ink-3')}>
          {icon}
        </span>
      </div>
      <div className="tabular mt-3 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-3">{sub}</div>}
    </Card>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

export function Overview() {
  const products = useInventory((s) => s.products);
  const transactions = useInventory((s) => s.transactions);
  const movements = useInventory((s) => s.movements);
  const forecasts = useForecasts();
  const money = useMoney();
  const simStatus = useSim((s) => s.status);
  const [action, setAction] = useState<StockAction | null>(null);

  const today = startOfDay(Date.now());
  const stats = useMemo(() => {
    const todayTx = transactions.filter((t) => t.timestamp >= today);
    const yday = transactions.filter((t) => t.timestamp >= today - DAY_MS && t.timestamp < today);
    const units = products.reduce((a, p) => a + p.quantity, 0);
    const value = products.reduce((a, p) => a + p.quantity * p.costPrice, 0);
    const retail = products.reduce((a, p) => a + p.quantity * p.sellingPrice, 0);
    let low = 0, out = 0;
    for (const p of products) {
      const st = forecasts.get(p.id)?.status;
      if (st === 'out') out++;
      else if (st === 'low' || st === 'critical') low++;
    }
    return {
      todayRevenue: todayTx.reduce((a, t) => a + t.total, 0),
      ydayRevenue: yday.reduce((a, t) => a + t.total, 0),
      todayCount: todayTx.length,
      units, value, retail, low, out,
    };
  }, [transactions, products, forecasts, today]);

  const revenueSeries = useMemo(
    () => dailySeries({ transactions } as InventoryState, 14).map((d) => ({ ...d, label: fmtShortDay(d.day) })),
    [transactions],
  );

  const topSellers = useMemo(() => {
    const since = Date.now() - 30 * DAY_MS;
    const m = new Map<string, { name: string; units: number; revenue: number }>();
    for (const t of transactions) {
      if (t.timestamp < since) continue;
      const cur = m.get(t.productId) ?? { name: t.productName, units: 0, revenue: 0 };
      cur.units += t.quantity;
      cur.revenue += t.total;
      m.set(t.productId, cur);
    }
    return [...m.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 6);
  }, [transactions]);

  const distribution = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) m.set(p.category, (m.get(p.category) ?? 0) + p.quantity * p.costPrice);
    const total = [...m.values()].reduce((a, b) => a + b, 0) || 1;
    return [...m.entries()].map(([category, value]) => ({ category, value, pct: (value / total) * 100 })).sort((a, b) => b.value - a.value);
  }, [products]);

  const alerts = products
    .map((p) => ({ p, f: forecasts.get(p.id)! }))
    .filter((x) => x.f && x.f.status !== 'healthy')
    .sort((a, b) => (a.f.daysUntilStockout ?? 0) - (b.f.daysUntilStockout ?? 0));

  const revDelta = stats.ydayRevenue > 0 ? ((stats.todayRevenue - stats.ydayRevenue) / stats.ydayRevenue) * 100 : null;

  return (
    <div className="mx-auto max-w-[1400px] space-y-6">
      {/* Quick actions + virtual shop entry */}
      <div className="flex flex-col gap-4 xl:flex-row">
        <Link to="/shop" className="group relative flex flex-1 flex-wrap items-center gap-x-5 gap-y-3 overflow-hidden rounded-xl border border-[#2b2f24] bg-[#1d2118] px-5 py-4 text-white">
          <ShopThumb />
          <div className="min-w-[200px] flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[15px] font-semibold">Virtual Shop</span>
              {simStatus === 'running' ? <Badge tone="brand">● Simulation running</Badge> : <span className="text-xs text-white/60">Simulation {simStatus === 'paused' ? 'paused' : 'ready'}</span>}
            </div>
            <p className="mt-0.5 text-[13px] text-white/70">Watch customers shop. Every purchase updates the same inventory you manage here.</p>
          </div>
          <span className="flex shrink-0 items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-ink transition-transform group-hover:translate-x-0.5">
            Open shop <ArrowRight size={15} />
          </span>
        </Link>
        <Card className="flex flex-wrap items-center gap-2 xl:w-auto" pad={false}>
          <div className="flex flex-wrap items-center gap-2 p-4">
            <Button variant="primary" icon={<ShoppingCart size={15} />} onClick={() => setAction('sale')}>Record sale</Button>
            <Button icon={<ArrowDownToLine size={15} />} onClick={() => setAction('in')}>Stock in</Button>
            <Button icon={<SlidersHorizontal size={15} />} onClick={() => setAction('adjust')}>Adjust</Button>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Inventory items" value={fmtNum(products.length)} sub={`${fmtNum(stats.units)} units on hand`} icon={<Boxes size={16} />} to="/inventory" />
        <Kpi label="Inventory value" value={money(stats.value, true)} sub={`${money(stats.retail, true)} at retail`} icon={<IndianRupee size={16} />} />
        <Kpi
          label="Today's revenue"
          value={money(stats.todayRevenue)}
          sub={revDelta === null ? 'No sales yesterday' : `${revDelta >= 0 ? '+' : ''}${revDelta.toFixed(0)}% vs yesterday (${money(stats.ydayRevenue)})`}
          icon={<ReceiptText size={16} />}
          to="/sales"
        />
        <Kpi label="Transactions" value={fmtNum(transactions.length)} sub={`${stats.todayCount} today`} icon={<PackageMinus size={16} />} to="/sales" />
        <Kpi label="Low stock" value={fmtNum(stats.low)} sub="At or below reorder point" icon={<AlertTriangle size={16} />} tone={stats.low ? 'warn' : 'neutral'} to="/forecasting" />
        <Kpi label="Out of stock" value={fmtNum(stats.out)} sub="Cannot be sold" icon={<CircleSlash size={16} />} tone={stats.out ? 'crit' : 'neutral'} to="/inventory?status=out" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Sales revenue" subtitle="Last 14 days, all sources" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueSeries} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} interval="preserveStartEnd" minTickGap={16} />
                <YAxis {...axisProps} width={56} tickFormatter={(v) => money(v, true)} />
                <Tooltip
                  cursor={{ fill: 'rgba(28,29,31,0.04)' }}
                  content={({ active, payload, label }) => (
                    <ChartTooltip
                      active={active}
                      label={label}
                      rows={payload?.length ? [
                        { color: '#2a78d6', name: 'Revenue', value: money(Number(payload[0].payload.revenue)) },
                        { color: 'transparent', name: 'Units sold', value: fmtNum(Number(payload[0].payload.units)) },
                      ] : []}
                    />
                  )}
                />
                <Bar dataKey="revenue" fill="#2a78d6" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Stock alerts" subtitle={`${alerts.length} products need attention`} action={<Link to="/forecasting" className="text-[13px] font-medium text-brand-600 hover:underline">Forecasts</Link>} />
          <div className="-mx-2 max-h-64 space-y-0.5 overflow-y-auto">
            {alerts.length === 0 && <p className="px-2 py-8 text-center text-sm text-ink-3">Everything is well stocked.</p>}
            {alerts.map(({ p, f }) => (
              <Link key={p.id} to={`/forecasting?product=${p.id}`} className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 hover:bg-canvas">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="tabular text-xs text-ink-3">
                    {p.quantity} {p.unit} · {p.quantity === 0 ? 'reorder now' : `~${f.daysUntilStockout?.toFixed(1)} days left`} · order {f.recommendedQty}
                  </div>
                </div>
                <StatusBadge status={f.status} />
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Top-selling products" subtitle="By revenue, last 30 days" />
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topSellers} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barCategoryGap="28%">
                <CartesianGrid stroke="#ecebe6" horizontal={false} />
                <XAxis type="number" {...axisProps} tickFormatter={(v) => money(v, true)} />
                <YAxis type="category" dataKey="name" {...axisProps} width={112} tick={{ fill: '#4f5052', fontSize: 12 }} />
                <Tooltip
                  cursor={{ fill: 'rgba(28,29,31,0.04)' }}
                  content={({ active, payload }) => (
                    <ChartTooltip
                      active={active}
                      label={payload?.[0]?.payload.name}
                      rows={payload?.length ? [
                        { color: '#1baf7a', name: 'Revenue', value: money(Number(payload[0].payload.revenue)) },
                        { color: 'transparent', name: 'Units', value: fmtNum(Number(payload[0].payload.units)) },
                      ] : []}
                    />
                  )}
                />
                <Bar dataKey="revenue" fill="#1baf7a" radius={[0, 4, 4, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Inventory distribution" subtitle="Stock value at cost, by category" />
          <div className="space-y-3.5">
            {distribution.map((d) => (
              <div key={d.category}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="font-medium">{d.category}</span>
                  <span className="tabular text-ink-2">
                    {money(d.value, true)} <span className="text-ink-3">· {d.pct.toFixed(0)}%</span>
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-canvas" title={`${d.category}: ${d.pct.toFixed(1)}%`}>
                  <div className="h-full rounded-full bg-series-7" style={{ width: `${Math.max(d.pct, 1)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card pad={false}>
          <div className="p-5 pb-2">
            <CardHeader title="Recent transactions" action={<Link to="/sales" className="text-[13px] font-medium text-brand-600 hover:underline">View all</Link>} />
          </div>
          <ul className="divide-y divide-line">
            {transactions.slice(0, 7).map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.quantity} × {t.productName}</div>
                  <div className="text-xs text-ink-3">{relativeTime(t.timestamp)}</div>
                </div>
                {t.source === 'simulation' ? <Badge tone="blue"><Gamepad2 size={11} /> Virtual shop</Badge> : <Badge>Manual</Badge>}
                <span className="tabular w-20 text-right text-sm font-semibold">{money(t.total)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card pad={false}>
          <div className="p-5 pb-2">
            <CardHeader title="Recent stock activity" action={<Link to="/sales?tab=movements" className="text-[13px] font-medium text-brand-600 hover:underline">Movement history</Link>} />
          </div>
          <ul className="divide-y divide-line">
            {movements.slice(0, 7).map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-5 py-2.5">
                <MovementDot type={m.type} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.productName}</div>
                  <div className="truncate text-xs text-ink-3">{m.reason} · {relativeTime(m.timestamp)}</div>
                </div>
                <span className="tabular text-right text-sm">
                  <span className={m.change > 0 ? 'font-semibold text-ok' : 'font-semibold text-ink'}>{m.change > 0 ? '+' : ''}{m.change}</span>
                  <span className="ml-2 text-xs text-ink-3">{m.previousStock} → {m.newStock}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <StockActionModal action={action} onClose={() => setAction(null)} />
    </div>
  );
}

export function MovementDot({ type }: { type: 'in' | 'out' | 'adjustment' }) {
  const meta = {
    in: { cls: 'bg-ok-bg text-ok', label: 'IN' },
    out: { cls: 'bg-canvas text-ink-2', label: 'OUT' },
    adjustment: { cls: 'bg-warn-bg text-warn', label: 'ADJ' },
  }[type];
  return <span className={cx('flex h-7 w-9 shrink-0 items-center justify-center rounded-md text-[10px] font-bold tracking-wide', meta.cls)}>{meta.label}</span>;
}

/** Tiny pixel-art storefront used as the virtual-shop entry thumbnail. */
function ShopThumb() {
  return (
    <svg width="64" height="48" viewBox="0 0 32 24" shapeRendering="crispEdges" className="shrink-0" aria-hidden>
      <rect width="32" height="24" fill="#3b5d2a" />
      <rect x="3" y="5" width="26" height="16" fill="#8a5a3c" />
      <rect x="3" y="3" width="26" height="3" fill="#b8442f" />
      {[3, 7, 11, 15, 19, 23, 27].map((x) => <rect key={x} x={x} y="3" width="2" height="3" fill="#f2e6c9" />)}
      <rect x="6" y="9" width="7" height="5" fill="#9fd3e6" />
      <rect x="19" y="9" width="7" height="5" fill="#9fd3e6" />
      <rect x="14" y="12" width="4" height="9" fill="#4a2f22" />
      <rect x="7" y="10" width="2" height="2" fill="#e8b04b" />
      <rect x="21" y="11" width="3" height="2" fill="#c3c9cf" />
      <rect x="0" y="21" width="32" height="3" fill="#a09a8a" />
    </svg>
  );
}
