import { cn } from '@/lib/utils';

export function Card({
  title,
  action,
  children,
  className,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('card', className)}>
      {title && (
        <header className="card-header">
          <h2 className="card-title">{title}</h2>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

/**
 * Never render a bare blank cell: the spec requires the reason a value is
 * missing to be visible.
 */
export function Missing({ reason }: { reason: string }) {
  return (
    <span className="text-ink-faint" title={reason}>
      {reason}
    </span>
  );
}

export function EmptyState({ title, detail, action }: { title: string; detail?: string; action?: React.ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {detail && <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{detail}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorNotice({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="rounded border border-bad/30 bg-bad/5 px-4 py-3">
      <p className="text-sm font-medium text-bad">{title}</p>
      {detail && <p className="mt-1 text-sm text-ink-muted">{detail}</p>}
    </div>
  );
}

const VISIBILITY_STYLES = {
  HIGH: 'border-good/30 bg-good/10 text-good',
  MEDIUM: 'border-warn/30 bg-warn/10 text-warn',
  LOW: 'border-line bg-surface-sunken text-ink-muted',
} as const;

export function VisibilityBadge({ level }: { level: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  const explanation = {
    HIGH: 'Revenue and profit are disclosed in the filed accounts.',
    MEDIUM: 'Some figures are filed, but turnover is not disclosed.',
    LOW: 'Little or no financial information could be extracted. This is not a judgement on performance.',
  }[level];

  return (
    <span
      title={explanation}
      className={cn(
        'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        VISIBILITY_STYLES[level],
      )}
    >
      {level} visibility
    </span>
  );
}

export function ScoreBadge({ score, size = 'md' }: { score: number | null; size?: 'sm' | 'md' | 'lg' }) {
  if (score === null) {
    return <span className="text-ink-faint">Not scored</span>;
  }

  const tone =
    score >= 80 ? 'border-good/40 bg-good/10 text-good'
    : score >= 60 ? 'border-accent/40 bg-accent-soft text-accent'
    : score >= 40 ? 'border-warn/40 bg-warn/10 text-warn'
    : 'border-line bg-surface-sunken text-ink-muted';

  const dimensions = { sm: 'px-1.5 py-0.5 text-xs', md: 'px-2 py-1 text-sm', lg: 'px-3 py-1.5 text-lg' }[size];

  return (
    <span className={cn('inline-flex items-center rounded border font-semibold tabular', tone, dimensions)}>
      {Math.round(score)}
    </span>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="px-4 py-3">
      <div className="label">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular">{value}</div>
      {hint && <div className="text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}
