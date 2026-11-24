import { useEffect, type ReactNode, type ButtonHTMLAttributes, type InputHTMLAttributes, type SelectHTMLAttributes } from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash, X, XCircle } from 'lucide-react';
import type { StockStatus } from '../domain/types';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

export function Card({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <div className={cx('rounded-xl border border-line bg-surface shadow-[var(--shadow-card)]', pad && 'p-5', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({
  variant = 'secondary', size = 'md', className, children, icon, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; icon?: ReactNode }) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-brand text-white hover:bg-brand-600 border border-brand',
    secondary: 'bg-surface text-ink border border-line-strong hover:bg-canvas',
    ghost: 'text-ink-2 hover:bg-canvas hover:text-ink border border-transparent',
    danger: 'bg-crit text-white border border-crit hover:brightness-110',
  };
  return (
    <button
      {...rest}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-2.5 text-[13px]' : 'h-9 px-3.5 text-sm',
        styles[variant],
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

const STATUS_META: Record<StockStatus, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  healthy: { label: 'Healthy', cls: 'bg-ok-bg text-ok', Icon: CheckCircle2 },
  low: { label: 'Low stock', cls: 'bg-warn-bg text-warn', Icon: AlertTriangle },
  critical: { label: 'Critical', cls: 'bg-crit-bg text-crit', Icon: XCircle },
  out: { label: 'Out of stock', cls: 'bg-crit text-white', Icon: CircleSlash },
};

export function StatusBadge({ status }: { status: StockStatus }) {
  const m = STATUS_META[status];
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', m.cls)}>
      <m.Icon size={12} strokeWidth={2.5} />
      {m.label}
    </span>
  );
}
export const statusLabel = (s: StockStatus) => STATUS_META[s].label;

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'blue' | 'warn' }) {
  const t = {
    neutral: 'bg-canvas text-ink-2 border-line',
    brand: 'bg-brand-50 text-brand border-transparent',
    blue: 'bg-[#eaf2fc] text-[#1d5fae] border-transparent',
    warn: 'bg-warn-bg text-warn border-transparent',
  }[tone];
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-xs font-medium', t)}>{children}</span>;
}

export function Modal({ open, onClose, title, children, footer, width = 'max-w-lg' }: {
  open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className={cx('animate-fade-up w-full rounded-xl border border-line bg-surface shadow-[var(--shadow-pop)]', width)}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-ink-3 hover:bg-canvas hover:text-ink" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3 rounded-b-xl">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  );
}

const withWidth = (cls?: string) => (cls && /(^|\s)w-/.test(cls) ? '' : 'w-full');
const inputCls =
  'h-9 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 transition-colors focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/15';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputCls, withWidth(props.className), props.className)} />;
}
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputCls, withWidth(props.className), 'pr-8', props.className)} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputCls, 'w-full h-auto py-2', props.className)} />;
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-canvas p-3 text-ink-3">{icon}</div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {text && <p className="mt-1 max-w-sm text-[13px] text-ink-3">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, size = 'md' }: {
  value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex rounded-lg border border-line-strong bg-canvas p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-md font-medium transition-colors',
            size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-[13px]',
            value === o.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Th({ children, className, align = 'left' }: { children?: ReactNode; className?: string; align?: 'left' | 'right' | 'center' }) {
  return (
    <th className={cx('whitespace-nowrap px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-ink-3', align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left', className)}>
      {children}
    </th>
  );
}
export function Td({ children, className, align = 'left' }: { children?: ReactNode; className?: string; align?: 'left' | 'right' | 'center' }) {
  return (
    <td className={cx('px-4 py-3 text-sm', align === 'right' ? 'text-right tabular' : align === 'center' ? 'text-center' : '', className)}>{children}</td>
  );
}

/** Thin progress bar that colours itself by stock status. */
export function StockBar({ value, max, status }: { value: number; max: number; status: StockStatus }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = status === 'healthy' ? 'bg-ok' : status === 'low' ? 'bg-warn' : 'bg-crit';
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-canvas">
      <div className={cx('h-full rounded-full', color)} style={{ width: `${Math.max(pct, value > 0 ? 3 : 0)}%` }} />
    </div>
  );
}
