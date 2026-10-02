import type { Signal } from '@/lib/signals';
import { EmptyState } from './primitives';
import { cn } from '@/lib/utils';

const TONE = {
  positive: { dot: 'bg-good', label: 'text-good' },
  neutral: { dot: 'bg-ink-faint', label: 'text-ink' },
  caution: { dot: 'bg-warn', label: 'text-warn' },
  negative: { dot: 'bg-bad', label: 'text-bad' },
} as const;

export function SignalList({ signals, only }: { signals: Signal[]; only?: Signal['severity'][] }) {
  const shown = only ? signals.filter((s) => only.includes(s.severity)) : signals;

  if (shown.length === 0) {
    return <EmptyState title="No signals detected" detail="Nothing in the filings met a signal threshold." />;
  }

  return (
    <ul className="divide-y divide-line">
      {shown.map((signal) => {
        const tone = TONE[signal.severity];
        return (
          <li key={signal.signalType} className="flex gap-3 px-4 py-3">
            <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', tone.dot)} aria-hidden />
            <div className="min-w-0">
              <p className={cn('text-sm font-medium', tone.label)}>{signal.title}</p>
              <p className="mt-0.5 text-sm text-ink-muted">{signal.description}</p>
            </div>
            <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide text-ink-faint">
              {signal.source.replace('_', ' ')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
