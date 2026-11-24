import type { ReactNode } from 'react';

/** Shared tooltip shell for Recharts — text stays in ink tokens; a swatch carries series identity. */
export function ChartTooltip({ active, label, rows }: {
  active?: boolean; label?: ReactNode; rows: { color: string; name: string; value: ReactNode }[];
}) {
  if (!active || rows.length === 0) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
      {label !== undefined && <div className="mb-1 font-medium text-ink">{label}</div>}
      {rows.map((r) => (
        <div key={r.name} className="flex items-center gap-2 text-ink-2">
          <span className="h-2 w-2 rounded-sm" style={{ background: r.color }} />
          <span className="flex-1">{r.name}</span>
          <span className="tabular font-semibold text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export const axisProps = {
  tick: { fill: '#7c7d7f', fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

export const gridProps = { stroke: '#ecebe6', vertical: false } as const;

export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
