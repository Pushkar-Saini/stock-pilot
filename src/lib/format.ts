import { useInventory } from '../store/inventoryStore';
import type { Settings } from '../domain/types';

const LOCALE: Record<Settings['currency'], string> = { INR: 'en-IN', USD: 'en-US', EUR: 'de-DE' };

export function formatMoney(n: number, currency: Settings['currency'], compact = false): string {
  return new Intl.NumberFormat(LOCALE[currency], {
    style: 'currency',
    currency,
    maximumFractionDigits: compact || Math.abs(n) >= 1000 ? 0 : 2,
    notation: compact && Math.abs(n) >= 100000 ? 'compact' : 'standard',
  }).format(n);
}

export function useMoney() {
  const currency = useInventory((s) => s.settings.currency);
  return (n: number, compact = false) => formatMoney(n, currency, compact);
}

export const fmtNum = (n: number, digits = 0) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(n);

export const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

export const fmtDateTime = (ts: number) =>
  new Date(ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export const fmtShortDay = (ts: number) => new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });

export function relativeTime(ts: number, now = Date.now()): string {
  const s = Math.round((now - ts) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return fmtShortDay(ts);
}
