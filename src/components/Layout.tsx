import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, Boxes, ChevronRight, Gamepad2, LayoutDashboard, LineChart, Menu, ReceiptText, Search, Settings, Truck, X,
} from 'lucide-react';
import { useInventory } from '../store/inventoryStore';
import { useForecasts } from '../lib/useForecasts';
import { useSim } from '../store/simStore';
import { StatusBadge, cx } from './ui';
import { Toaster } from './Toaster';

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/shop', label: 'Virtual Shop', icon: Gamepad2 },
  { to: '/inventory', label: 'Inventory', icon: Boxes },
  { to: '/sales', label: 'Sales & Transactions', icon: ReceiptText },
  { to: '/suppliers', label: 'Suppliers', icon: Truck },
  { to: '/forecasting', label: 'Demand Forecasting', icon: LineChart },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const TITLES: Record<string, string> = Object.fromEntries(NAV.map((n) => [n.to, n.label]));

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="7" fill="#14532d" />
        <path d="M7 21.5 16 8l9 13.5h-5.5V25h-7v-3.5z" fill="#fff" />
        <rect x="12.5" y="17" width="7" height="2" fill="#14532d" />
      </svg>
      {!compact && (
        <div className="leading-none">
          <div className="text-[15px] font-bold tracking-tight text-ink">StockPilot</div>
          <div className="mt-0.5 text-[11px] text-ink-3">Smart inventory</div>
        </div>
      )}
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const status = useSim((s) => s.status);
  const business = useInventory((s) => s.settings.businessName);
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-5 pt-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cx(
                'group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-brand-50 text-brand' : 'text-ink-2 hover:bg-canvas hover:text-ink',
              )
            }
          >
            <Icon size={17} strokeWidth={2} />
            <span className="flex-1">{label}</span>
            {to === '/shop' && status === 'running' && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-ok">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" /> Live
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="m-3 rounded-lg border border-line bg-canvas/70 p-3">
        <div className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Workspace</div>
        <div className="mt-0.5 truncate text-sm font-medium text-ink">{business}</div>
        <div className="mt-0.5 text-[11px] text-ink-3">Data saved in this browser</div>
      </div>
    </div>
  );
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const products = useInventory((s) => s.products);
  const forecasts = useForecasts();
  const navigate = useNavigate();
  const alerts = products
    .map((p) => ({ p, f: forecasts.get(p.id)! }))
    .filter(({ f }) => f && f.status !== 'healthy')
    .sort((a, b) => ['out', 'critical', 'low'].indexOf(a.f.status) - ['out', 'critical', 'low'].indexOf(b.f.status));

  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg p-2 text-ink-2 hover:bg-canvas hover:text-ink"
        aria-label={`Notifications (${alerts.length})`}
      >
        <Bell size={18} />
        {alerts.length > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-crit px-1 text-[10px] font-semibold text-white">
            {alerts.length}
          </span>
        )}
      </button>
      {open && (
        <div className="animate-fade-up absolute right-0 z-40 mt-2 w-80 rounded-xl border border-line bg-surface shadow-[var(--shadow-pop)]">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold">Stock alerts</span>
            <span className="text-xs text-ink-3">{alerts.length} need attention</span>
          </div>
          <div className="max-h-80 overflow-y-auto py-1">
            {alerts.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-3">All products are healthy.</p>}
            {alerts.map(({ p, f }) => (
              <button
                key={p.id}
                onClick={() => { setOpen(false); navigate(`/forecasting?product=${p.id}`); }}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-canvas"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="text-xs text-ink-3 tabular">
                    {p.quantity} {p.unit} left
                    {f.daysUntilStockout !== null && p.quantity > 0 && ` · ~${f.daysUntilStockout.toFixed(1)} days`}
                  </div>
                </div>
                <StatusBadge status={f.status} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const owner = useInventory((s) => s.settings.ownerName);
  const business = useInventory((s) => s.settings.businessName);
  const [q, setQ] = useState('');
  const initials = owner.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || 'SP';
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-line bg-canvas/85 px-4 backdrop-blur md:px-8">
      <button className="rounded-lg p-2 text-ink-2 hover:bg-surface lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu size={20} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="hidden items-center gap-1 text-xs text-ink-3 sm:flex">
          {business} <ChevronRight size={12} />
        </div>
        <h1 className="truncate text-lg font-semibold tracking-tight">{TITLES[pathname] ?? 'StockPilot'}</h1>
      </div>
      <form
        className="relative hidden md:block"
        onSubmit={(e) => { e.preventDefault(); navigate(`/inventory?q=${encodeURIComponent(q)}`); }}
      >
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products or SKU…"
          className="h-9 w-64 rounded-lg border border-line bg-surface pl-9 pr-3 text-sm placeholder:text-ink-3 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15"
        />
      </form>
      <Notifications />
      <div className="flex items-center gap-2 pl-1">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-xs font-semibold text-white">{initials}</div>
        <div className="hidden text-sm leading-tight lg:block">
          <div className="font-medium">{owner}</div>
          <div className="text-xs text-ink-3">Owner</div>
        </div>
      </div>
    </header>
  );
}

export function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex min-h-full">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r border-line bg-surface lg:block">
        <Sidebar />
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/30" onClick={() => setMobileOpen(false)} />
          <aside className="animate-slide-in absolute inset-y-0 left-0 w-64 border-r border-line bg-surface">
            <button className="absolute right-3 top-5 rounded-md p-1 text-ink-3" onClick={() => setMobileOpen(false)} aria-label="Close menu">
              <X size={18} />
            </button>
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col lg:pl-60">
        <TopBar onMenu={() => setMobileOpen(true)} />
        <main className="flex-1 px-4 py-6 md:px-8">
          <Outlet />
        </main>
      </div>
      <Toaster />
    </div>
  );
}
