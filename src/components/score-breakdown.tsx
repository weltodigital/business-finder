'use client';

import { useState } from 'react';
import type { ScoreComponent, ScoreResult } from '@/lib/scoring';
import { cn } from '@/lib/utils';

/** Every point is traceable: clicking a component reveals why it was awarded. */
export function ScoreBreakdown({ score }: { score: ScoreResult }) {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-baseline gap-2 px-4 py-3">
        <span className="text-3xl font-semibold tabular">{Math.round(score.total)}</span>
        <span className="text-sm text-ink-muted">/ 100 acquisition score</span>
        <span className="ml-auto text-[11px] text-ink-faint">scoring {score.version}</span>
      </div>

      <ul className="border-t border-line">
        {score.components.map((component) => (
          <li key={component.key} className="border-b border-line last:border-b-0">
            <button
              onClick={() => setOpen(open === component.key ? null : component.key)}
              className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-sunken"
              aria-expanded={open === component.key}
            >
              <span className="flex-1 text-sm">{component.label}</span>
              <ComponentBar component={component} />
              <span className="w-16 text-right text-sm font-medium tabular">
                {formatPoints(component)}
              </span>
              <span className="text-xs text-ink-faint">{open === component.key ? '−' : '+'}</span>
            </button>

            {open === component.key && (
              <ul className="bg-surface-sunken px-4 pb-3 pt-1">
                {component.reasons.map((reason, index) => (
                  <li key={index} className="flex gap-3 border-t border-line/70 py-1.5 first:border-t-0">
                    <span
                      className={cn(
                        'w-10 shrink-0 text-right text-xs font-medium tabular',
                        reason.points > 0 ? 'text-good' : reason.points < 0 ? 'text-bad' : 'text-ink-faint',
                      )}
                    >
                      {reason.points > 0 ? '+' : ''}
                      {reason.points}
                    </span>
                    <span className="text-xs text-ink-muted">
                      <span className="font-medium text-ink">{reason.label}.</span> {reason.detail}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComponentBar({ component }: { component: ScoreComponent }) {
  if (component.key === 'risk_adjustment') {
    const magnitude = Math.min(Math.abs(component.score) / 10, 1);
    return (
      <span className="h-1.5 w-24 overflow-hidden rounded bg-line">
        <span className="block h-full bg-bad" style={{ width: `${magnitude * 100}%` }} />
      </span>
    );
  }

  const fraction = component.max > 0 ? component.score / component.max : 0;
  return (
    <span className="h-1.5 w-24 overflow-hidden rounded bg-line">
      <span className="block h-full bg-accent" style={{ width: `${Math.max(fraction, 0) * 100}%` }} />
    </span>
  );
}

function formatPoints(component: ScoreComponent): string {
  if (component.key === 'risk_adjustment') return `${component.score}`;
  return `${component.score} / ${component.max}`;
}
