import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { useToasts } from '../store/toastStore';
import { cx } from './ui';

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-80 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => {
        const Icon = t.tone === 'success' ? CheckCircle2 : t.tone === 'error' ? XCircle : Info;
        return (
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className="animate-slide-in pointer-events-auto flex items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-3 text-left text-sm shadow-[var(--shadow-pop)]"
          >
            <Icon size={17} className={cx('mt-px shrink-0', t.tone === 'success' ? 'text-ok' : t.tone === 'error' ? 'text-crit' : 'text-series-1')} />
            <span className="text-ink">{t.text}</span>
          </button>
        );
      })}
    </div>
  );
}
