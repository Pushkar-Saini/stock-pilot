import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Phaser from 'phaser';
import { AlertTriangle, ArrowLeft, ClipboardList, Coins, DoorOpen, LogOut, Pause, Play, Repeat, RotateCcw, ShoppingBag, Store, Timer, Truck, Users } from 'lucide-react';
import { ShopScene, GAME_W, GAME_H, HOVER_EVENT, type HoverInfo } from '../game/ShopScene';
import { useSim, type NoticeKind, type SimSpeed } from '../store/simStore';
import { useInventory } from '../store/inventoryStore';
import { useForecasts } from '../lib/useForecasts';
import { fmtNum, useMoney } from '../lib/format';
import { Button, Segmented, StatusBadge, cx } from '../components/ui';
import { SHELF_SLOTS } from '../game/shopLayout';

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function GameStage() {
  const host = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const products = useInventory((s) => s.products);
  const forecasts = useForecasts();
  const money = useMoney();

  useEffect(() => {
    if (!host.current) return;
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current,
      width: GAME_W,
      height: GAME_H,
      pixelArt: true,
      roundPixels: true,
      backgroundColor: '#1b1f17',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: [ShopScene],
      banner: false,
      audio: { noAudio: true },
    });
    const onHover = (e: Event) => setHover((e as CustomEvent<HoverInfo | null>).detail);
    window.addEventListener(HOVER_EVENT, onHover);
    return () => {
      window.removeEventListener(HOVER_EVENT, onHover);
      game.destroy(true);
    };
  }, []);

  const hp = hover ? products.find((p) => p.id === hover.productId) : undefined;
  const hf = hp ? forecasts.get(hp.id) : undefined;

  return (
    <div className="relative w-full overflow-hidden rounded-lg bg-[#1b1f17]" style={{ aspectRatio: `${GAME_W} / ${GAME_H}` }}>
      <div ref={host} className="game-host absolute inset-0" />
      {hp && hf && hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-[#3a3f33] bg-[#14170f]/95 px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{ left: `${hover.fx * 100}%`, top: `calc(${hover.fy * 100}% - 4px)` }}
        >
          <div className="font-semibold">{hp.name}</div>
          <div className="tabular text-white/70">{hp.quantity} {hp.unit} · {money(hp.sellingPrice)} each</div>
          <div className="mt-1"><StatusBadge status={hf.status} /></div>
        </div>
      )}
      <FloatingNotices />
    </div>
  );
}

const NOTICE_META: Record<NoticeKind, { Icon: typeof Coins; feed: string; toast: string }> = {
  enter: { Icon: DoorOpen, feed: 'text-ink-3', toast: '' },
  sale: { Icon: Coins, feed: 'text-ok', toast: 'border-[#2f5d3a] bg-[#14301c]/90 text-[#c9f2d3]' },
  unavailable: { Icon: Repeat, feed: 'text-warn', toast: '' },
  left: { Icon: LogOut, feed: 'text-crit', toast: 'border-[#5a2a2a] bg-[#2e1515]/90 text-[#ffc9c9]' },
  reorder: { Icon: ClipboardList, feed: 'text-series-1', toast: 'border-[#244a78] bg-[#0f2137]/90 text-[#c6defa]' },
  delivery: { Icon: Truck, feed: 'text-series-7', toast: 'border-[#3f3580] bg-[#1c1838]/90 text-[#d9d3ff]' },
  alert: { Icon: AlertTriangle, feed: 'text-warn', toast: 'border-[#7a4a1a] bg-[#3a240c]/90 text-[#ffd9a8]' },
};
const TOAST_KINDS: NoticeKind[] = ['sale', 'left', 'reorder', 'delivery', 'alert'];

/** Short-lived toasts over the stage for the important events. */
function FloatingNotices() {
  const notices = useSim((s) => s.notices);
  const now = useNow(500);
  const recent = notices.filter((n) => TOAST_KINDS.includes(n.kind) && now - n.at < 4500).slice(0, 3);
  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[65%] flex-col gap-1.5">
      {recent.map((n) => {
        const m = NOTICE_META[n.kind];
        return (
          <div key={n.id} className={cx('animate-slide-in flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium shadow-lg backdrop-blur', m.toast)}>
            <m.Icon size={13} className="shrink-0" />
            <span className="truncate">{n.text}</span>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-ink-3">{icon}{label}</div>
      <div className="tabular mt-0.5 text-lg font-semibold">{value}</div>
    </div>
  );
}

export default function VirtualShop() {
  const sim = useSim();
  const money = useMoney();
  const products = useInventory((s) => s.products);
  const business = useInventory((s) => s.settings.businessName);
  const forecasts = useForecasts();
  const minutes = sim.runningMs / 60000;
  const perMin = minutes > 0.05 ? sim.transactions / minutes : 0;
  const shelfProducts = products.slice(0, SHELF_SLOTS.length);

  const lowStock = useMemo(
    () => shelfProducts.map((p) => ({ p, f: forecasts.get(p.id)! })).filter((x) => x.f && x.f.status !== 'healthy'),
    [shelfProducts, forecasts],
  );

  // Pause automatically when leaving the page, so no customers shop unseen.
  useEffect(() => () => useSim.getState().pause(), []);

  const statusLabel = sim.status === 'running' ? 'Running' : sim.status === 'paused' ? 'Paused' : 'Not started';

  return (
    <div className="mx-auto max-w-[1500px] space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-line-strong bg-surface px-3 text-sm font-medium hover:bg-canvas">
          <ArrowLeft size={15} /> Back to dashboard
        </Link>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm">
          <span className={cx('h-2 w-2 rounded-full', sim.status === 'running' ? 'animate-pulse bg-ok' : sim.status === 'paused' ? 'bg-warn' : 'bg-ink-3')} />
          <span className="font-medium">{statusLabel}</span>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {sim.status === 'idle' && <Button variant="primary" icon={<Play size={15} />} onClick={sim.start}>Start simulation</Button>}
          {sim.status === 'running' && <Button icon={<Pause size={15} />} onClick={sim.pause}>Pause</Button>}
          {sim.status === 'paused' && <Button variant="primary" icon={<Play size={15} />} onClick={sim.resume}>Resume</Button>}
          <Button variant="ghost" icon={<RotateCcw size={15} />} onClick={sim.reset} disabled={sim.status === 'idle' && sim.customersServed === 0}>Reset</Button>
          <div className="flex items-center gap-2 pl-1 text-[13px] text-ink-2">
            Speed
            <Segmented<SimSpeed> value={sim.speed} onChange={sim.setSpeed} options={[{ value: 1, label: '1×' }, { value: 2, label: '2×' }, { value: 4, label: '4×' }]} />
          </div>
          <label className="flex cursor-pointer select-none items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-[13px] font-medium">
            <input type="checkbox" checked={sim.autoReorder} onChange={(e) => sim.setAutoReorder(e.target.checked)} className="h-4 w-4 accent-[#14532d]" />
            Auto-reorder
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="rounded-xl border border-[#2b2f24] bg-[#23281d] p-2 shadow-[var(--shadow-card)]">
          <GameStage />
          <div className="flex flex-wrap items-center justify-between gap-2 px-2 pb-1 pt-2.5 text-xs text-white/60">
            <span className="flex items-center gap-1.5"><Store size={13} /> {business} · {shelfProducts.length} products on shelves · hover a shelf for live stock</span>
            <span>Reset clears customers and session stats only. Recorded sales stay in your inventory.</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            <Stat icon={<Users size={13} />} label="Customers inside" value={fmtNum(sim.customersInside)} />
            <Stat icon={<ShoppingBag size={13} />} label="Customers served" value={fmtNum(sim.customersServed)} />
            <Stat icon={<Coins size={13} />} label="Transactions" value={fmtNum(sim.transactions)} />
            <Stat icon={<Timer size={13} />} label="Sales / minute" value={perMin.toFixed(1)} />
            <Stat icon={<ClipboardList size={13} />} label="Orders placed" value={fmtNum(sim.ordersPlaced)} />
            <Stat icon={<Truck size={13} />} label="Deliveries" value={fmtNum(sim.deliveriesReceived)} />
            <div className="col-span-2 rounded-lg border border-line bg-surface px-3 py-2.5">
              <div className="flex items-center justify-between text-xs text-ink-3">
                <span>Session revenue</span>
                <span>{sim.customersLeftEmpty} left without buying</span>
              </div>
              <div className="tabular mt-0.5 text-2xl font-semibold">{money(sim.revenue)}</div>
            </div>
          </div>

          <OrdersPanel />
          <ActivityFeed />

          <div className="rounded-xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="text-sm font-semibold">Low-stock alerts</span>
              <Link to="/forecasting" className="text-xs font-medium text-brand-600 hover:underline">Reorder plan</Link>
            </div>
            <ul className="max-h-52 divide-y divide-line overflow-y-auto">
              {lowStock.length === 0 && <li className="px-4 py-5 text-center text-[13px] text-ink-3">All shelves are well stocked.</li>}
              {lowStock.map(({ p, f }) => (
                <li key={p.id} className="flex items-center justify-between gap-2 px-4 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium">{p.name}</div>
                    <div className="tabular text-xs text-ink-3">{p.quantity} {p.unit} left</div>
                  </div>
                  <StatusBadge status={f.status} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function OrdersPanel() {
  const orders = useSim((s) => s.orders);
  const simTime = useSim((s) => s.simTime);
  const autoReorder = useSim((s) => s.autoReorder);
  const money = useMoney();
  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <span className="text-sm font-semibold">On order</span>
        <span className="text-right text-xs text-ink-3">{autoReorder ? 'Reorders at the reorder point' : 'Auto-reorder is off'}</span>
      </div>
      <ul className="max-h-48 divide-y divide-line overflow-y-auto">
        {orders.length === 0 && <li className="px-4 py-4 text-center text-[13px] text-ink-3">No open purchase orders.</li>}
        {orders.map((o) => {
          const total = Math.max(1, o.arriveAt - o.orderedAt);
          const pct = Math.min(100, ((simTime - o.orderedAt) / total) * 100);
          const left = Math.max(0, Math.ceil(o.arriveAt - simTime));
          return (
            <li key={o.id} className="px-4 py-2.5">
              <div className="flex items-baseline justify-between gap-2 text-[13px]">
                <span className="truncate font-medium">{o.quantity} × {o.productName}</span>
                <span className="tabular shrink-0 text-xs text-ink-3">{money(o.quantity * o.unitCost)}</span>
              </div>
              <div className="mt-0.5 flex justify-between gap-2 text-xs text-ink-3">
                <span className="truncate">{o.supplierName}</span>
                <span className={cx('shrink-0 font-medium', o.status === 'delivering' && 'text-series-7')}>
                  {o.status === 'delivering' ? 'Restocking shelf…' : left === 0 ? 'Van waiting…' : `Arrives in ${left}s`}
                </span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-canvas">
                <div className={cx('h-full rounded-full', o.status === 'delivering' ? 'bg-series-7' : 'bg-series-1')} style={{ width: `${o.status === 'delivering' ? 100 : pct}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ActivityFeed() {
  const notices = useSim((s) => s.notices);
  const [filter, setFilter] = useState<'all' | 'customers' | 'stock'>('all');
  const now = useNow(5000);
  const shown = notices.filter((n) =>
    filter === 'all' ? true : filter === 'stock' ? ['reorder', 'delivery', 'alert'].includes(n.kind) : ['enter', 'sale', 'unavailable', 'left'].includes(n.kind),
  );
  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
        <span className="text-sm font-semibold">Live activity</span>
        <Segmented size="sm" value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All' }, { value: 'customers', label: 'Customers' }, { value: 'stock', label: 'Stock' }]} />
      </div>
      <ul className="max-h-80 divide-y divide-line overflow-y-auto">
        {shown.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-ink-3">Start the simulation to see customers, sales, reorders and deliveries here.</li>}
        {shown.map((n) => {
          const m = NOTICE_META[n.kind];
          const secs = Math.max(0, Math.round((now - n.at) / 1000));
          return (
            <li key={n.id} className="flex items-start gap-2.5 px-4 py-2 text-[13px]">
              <m.Icon size={14} className={cx('mt-0.5 shrink-0', m.feed)} />
              <span className="flex-1 text-ink-2">{n.text}</span>
              <span className="shrink-0 text-[11px] text-ink-3">{secs < 5 ? 'now' : secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m`}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
