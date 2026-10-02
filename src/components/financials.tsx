import type { FinancialPeriod } from '@/lib/accounts/normalise';
import type { FinancialSummary } from '@/lib/financials/analytics';
import { EmptyState, Missing } from './primitives';
import { cn, money, percent, shortDate, count } from '@/lib/utils';

const ROWS: Array<{ label: string; pick: (p: FinancialPeriod) => number | null; format: (v: number | null) => string }> = [
  { label: 'Revenue', pick: (p) => p.revenue, format: money },
  { label: 'Gross profit', pick: (p) => p.grossProfit, format: money },
  { label: 'Operating profit', pick: (p) => p.operatingProfit, format: money },
  { label: 'Profit before tax', pick: (p) => p.profitBeforeTax, format: money },
  { label: 'Net profit', pick: (p) => p.netProfit, format: money },
  { label: 'Gross margin', pick: (p) => p.grossMargin, format: (v) => percent(v) },
  { label: 'Operating margin', pick: (p) => p.operatingMargin, format: (v) => percent(v) },
  { label: 'Cash', pick: (p) => p.cash, format: money },
  { label: 'Net assets', pick: (p) => p.netAssets, format: money },
  { label: 'Current ratio', pick: (p) => p.currentRatio, format: (v) => (v === null ? '—' : v.toFixed(2)) },
  { label: 'Debt', pick: (p) => sum(p.shortTermDebt, p.longTermDebt), format: money },
  { label: 'Employees', pick: (p) => p.employeeCount, format: count },
];

export function FinancialHistory({ periods }: { periods: FinancialPeriod[] }) {
  if (periods.length === 0) {
    return (
      <EmptyState
        title="No financial figures extracted"
        detail="No accounts document yielded extractable figures. This reflects what is published, not how the business is performing."
      />
    );
  }

  const shown = periods.slice(-5);

  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th className="w-44">Metric</th>
            {shown.map((period) => (
              <th key={period.periodEnd} className="text-right">
                <div>{shortDate(period.periodEnd)}</div>
                {period.months && period.months !== 12 && (
                  <div className="font-normal normal-case text-warn">{period.months}-month period</div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label}>
              <td className="text-ink-muted">{row.label}</td>
              {shown.map((period) => {
                const value = row.pick(period);
                return (
                  <td key={period.periodEnd} className="num">
                    {value === null ? <Missing reason="not disclosed" /> : row.format(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {shown.some((p) => p.validationStatus === 'needs_review') && (
        <p className="border-t border-line px-3 py-2 text-xs text-warn">
          One or more periods failed an accounting consistency check and are flagged for review.
        </p>
      )}
      {shown.some((p) => p.hasEstimates) && (
        <p className="border-t border-line px-3 py-2 text-xs text-ink-muted">
          Some figures were derived from other reported lines (for example gross profit from revenue less cost of
          sales) rather than read directly from the accounts.
        </p>
      )}
    </div>
  );
}

/** The at-a-glance trend block from the target detail spec. */
export function FinancialTrend({ summary }: { summary: FinancialSummary }) {
  if (summary.financialVisibility === 'LOW') {
    return (
      <div className="px-4 py-4 text-sm text-ink-muted">
        Not enough disclosed financial information to assess a trend.
      </div>
    );
  }

  const rows = [
    trendRow('Revenue', summary.revenueCagr, (v) => `${percent(v)} CAGR`),
    trendRow('Profit', summary.operatingProfitCagr, (v) => `${percent(v)} CAGR`),
    marginRow(summary),
    trendRow('Cash', summary.cashGrowthYoY, (v) => `${percent(v)} YoY`),
    balanceSheetRow(summary),
  ];

  return (
    <dl className="divide-y divide-line">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-3 px-4 py-2">
          <dt className="w-28 text-sm text-ink-muted">{row.label}</dt>
          <dd className={cn('flex items-center gap-2 text-sm font-medium', row.tone)}>
            <span aria-hidden>{row.arrow}</span>
            <span>{row.verdict}</span>
          </dd>
          <span className="ml-auto text-xs text-ink-muted tabular">{row.detail}</span>
        </div>
      ))}
    </dl>
  );
}

interface TrendRow {
  label: string;
  arrow: string;
  verdict: string;
  detail: string;
  tone: string;
}

function trendRow(label: string, value: number | null, format: (v: number) => string): TrendRow {
  if (value === null) {
    return { label, arrow: '·', verdict: 'Not disclosed', detail: '—', tone: 'text-ink-faint' };
  }
  if (value >= 0.08) return { label, arrow: '↑', verdict: 'Strong', detail: format(value), tone: 'text-good' };
  if (value >= 0.02) return { label, arrow: '↗', verdict: 'Growing', detail: format(value), tone: 'text-good' };
  if (value >= -0.02) return { label, arrow: '→', verdict: 'Stable', detail: format(value), tone: 'text-ink' };
  return { label, arrow: '↓', verdict: 'Declining', detail: format(value), tone: 'text-bad' };
}

function marginRow(summary: FinancialSummary): TrendRow {
  const latest = summary.latestOperatingMargin;
  const average = summary.avgOperatingMargin;
  if (latest === null || average === null) {
    return { label: 'Margins', arrow: '·', verdict: 'Not disclosed', detail: '—', tone: 'text-ink-faint' };
  }
  const delta = latest - average;
  if (delta >= 0.02) return { label: 'Margins', arrow: '↑', verdict: 'Improving', detail: percent(latest), tone: 'text-good' };
  if (delta <= -0.02) return { label: 'Margins', arrow: '↓', verdict: 'Compressing', detail: percent(latest), tone: 'text-bad' };
  return { label: 'Margins', arrow: '→', verdict: 'Stable', detail: percent(latest), tone: 'text-ink' };
}

function balanceSheetRow(summary: FinancialSummary): TrendRow {
  const netAssets = summary.latestNetAssets;
  if (netAssets === null) {
    return { label: 'Balance sheet', arrow: '·', verdict: 'Not disclosed', detail: '—', tone: 'text-ink-faint' };
  }
  if (netAssets <= 0) {
    return { label: 'Balance sheet', arrow: '●', verdict: 'Negative net assets', detail: money(netAssets), tone: 'text-bad' };
  }
  const ratio = summary.latestCurrentRatio;
  if (ratio !== null && ratio < 1) {
    return { label: 'Balance sheet', arrow: '●', verdict: 'Tight liquidity', detail: `current ratio ${ratio.toFixed(2)}`, tone: 'text-warn' };
  }
  return { label: 'Balance sheet', arrow: '●', verdict: 'Healthy', detail: money(netAssets), tone: 'text-good' };
}

function sum(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

/**
 * Inline SVG bars: no chart library, renders on the server, and stays legible
 * at the small sizes this dense layout uses.
 */
export function FinancialChart({
  periods,
  metric,
  label,
}: {
  periods: FinancialPeriod[];
  metric: 'revenue' | 'operatingProfit' | 'cash';
  label: string;
}) {
  const points = periods
    .slice(-5)
    .map((period) => ({ periodEnd: period.periodEnd, value: period[metric] }))
    .filter((point): point is { periodEnd: string; value: number } => point.value !== null);

  if (points.length < 2) {
    return (
      <div className="px-4 py-3 text-xs text-ink-muted">
        {label}: not enough disclosed periods to chart.
      </div>
    );
  }

  const max = Math.max(...points.map((p) => Math.abs(p.value)), 1);
  const barWidth = 100 / points.length;

  return (
    <div className="px-4 py-3">
      <div className="label">{label}</div>
      <svg viewBox="0 0 100 34" preserveAspectRatio="none" className="mt-1 h-16 w-full" role="img" aria-label={label}>
        {points.map((point, index) => {
          const height = (Math.abs(point.value) / max) * 30;
          const negative = point.value < 0;
          return (
            <rect
              key={point.periodEnd}
              x={index * barWidth + barWidth * 0.15}
              y={negative ? 32 : 32 - height}
              width={barWidth * 0.7}
              height={Math.max(height, 0.5)}
              className={negative ? 'fill-bad' : 'fill-accent'}
            />
          );
        })}
      </svg>
      <div className="flex justify-between text-[10px] text-ink-faint">
        {points.map((point) => (
          <span key={point.periodEnd}>{point.periodEnd.slice(0, 4)}</span>
        ))}
      </div>
      <div className="mt-0.5 text-xs text-ink-muted tabular">
        {money(points[0].value)} → {money(points[points.length - 1].value)}
      </div>
    </div>
  );
}
