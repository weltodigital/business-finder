'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, ErrorNotice } from '@/components/primitives';
import { FEEDBACK_REASONS, FEEDBACK_VERDICTS, PIPELINE_STATUSES, type PipelineStatus } from '@/lib/types';
import { shortDate, titleCase } from '@/lib/utils';

interface TargetState {
  id: string;
  status: PipelineStatus;
  manualScore: number | null;
  manualScoreReason: string | null;
}

interface Note {
  id: string;
  body: string;
  created_at: string;
}

export function TargetActions({
  companyNumber,
  target,
  algorithmScore,
  notes,
}: {
  companyNumber: string;
  target: TargetState | null;
  algorithmScore: number;
  notes: Note[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const [manualScore, setManualScore] = useState(target?.manualScore?.toString() ?? '');
  const [manualReason, setManualReason] = useState(target?.manualScoreReason ?? '');

  async function act(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await action();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function post(path: string, body: unknown, method = 'POST') {
    const response = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error ?? `Request failed (${response.status})`);
    return payload;
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-2 p-3">
          {!target ? (
            <button
              className="btn-primary"
              disabled={busy !== null}
              onClick={() =>
                void act('save', () => post('/api/targets', { companyNumber, status: 'SHORTLISTED' }))
              }
            >
              {busy === 'save' ? 'Saving…' : 'Save as target'}
            </button>
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <span className="text-ink-muted">Status</span>
              <select
                className="input w-48 py-1"
                value={target.status}
                disabled={busy !== null}
                onChange={(e) =>
                  void act('status', () => post(`/api/targets/${target.id}`, { status: e.target.value }, 'PATCH'))
                }
              >
                {PIPELINE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {titleCase(status)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <button
            className="btn-secondary"
            disabled={busy !== null}
            onClick={() =>
              void act('refresh', () =>
                post(`/api/company/${companyNumber}/ingest`, {
                  includeAccounts: true,
                  includeAppointments: true,
                  forceRefresh: true,
                }),
              )
            }
          >
            {busy === 'refresh' ? 'Refreshing…' : 'Refresh Companies House data'}
          </button>

          <button
            className="btn-secondary"
            disabled={busy !== null}
            onClick={() =>
              void act('accounts', () => post(`/api/company/${companyNumber}/accounts`, { forceRefresh: true }))
            }
          >
            {busy === 'accounts' ? 'Extracting…' : 'Re-run financial extraction'}
          </button>

          <button
            className="btn-secondary"
            disabled={busy !== null}
            onClick={() => void act('score', () => post(`/api/company/${companyNumber}/score`, {}))}
          >
            {busy === 'score' ? 'Scoring…' : 'Recalculate score'}
          </button>

          <button
            className="btn-secondary"
            disabled={busy !== null}
            onClick={() => void act('enrich', () => post(`/api/company/${companyNumber}/enrich`, {}))}
          >
            {busy === 'enrich' ? 'Enriching…' : 'Enrich from website'}
          </button>

          {target && (
            <button
              className="btn-secondary"
              disabled={busy !== null}
              onClick={() =>
                void act('reject', () => post(`/api/targets/${target.id}`, { status: 'REJECTED' }, 'PATCH'))
              }
            >
              Reject
            </button>
          )}
        </div>
      </Card>

      {error && <ErrorNotice title="Action failed" detail={error} />}

      {target && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Your score" className="lg:col-span-1">
            <div className="space-y-2 p-3">
              <p className="text-xs text-ink-muted">
                The algorithm scored this {Math.round(algorithmScore)}. Your score is stored alongside it — the
                algorithmic score is never overwritten.
              </p>
              <div className="flex gap-2">
                <input
                  className="input w-24"
                  type="number"
                  min={0}
                  max={100}
                  placeholder="62"
                  value={manualScore}
                  onChange={(e) => setManualScore(e.target.value)}
                />
                <input
                  className="input flex-1"
                  placeholder="Too dependent on founder."
                  value={manualReason}
                  onChange={(e) => setManualReason(e.target.value)}
                />
              </div>
              <button
                className="btn-secondary"
                disabled={busy !== null}
                onClick={() =>
                  void act('manual', () =>
                    post(
                      `/api/targets/${target.id}`,
                      {
                        manualScore: manualScore.trim() === '' ? null : Number(manualScore),
                        manualScoreReason: manualReason.trim() === '' ? null : manualReason,
                      },
                      'PATCH',
                    ),
                  )
                }
              >
                {busy === 'manual' ? 'Saving…' : 'Save my score'}
              </button>
            </div>
          </Card>

          <Card title="Feedback" className="lg:col-span-1">
            <FeedbackForm
              disabled={busy !== null}
              onSubmit={(verdict, reason) =>
                void act('feedback', () => post(`/api/targets/${target.id}/feedback`, { verdict, reason }))
              }
            />
          </Card>

          <Card title="Notes" className="lg:col-span-1">
            <div className="p-3">
              <textarea
                className="input h-16 resize-y"
                placeholder="Spoke to owner. Not interested currently."
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
              />
              <button
                className="btn-secondary mt-2"
                disabled={busy !== null || noteBody.trim().length === 0}
                onClick={() =>
                  void act('note', async () => {
                    await post(`/api/targets/${target.id}/notes`, { body: noteBody.trim() });
                    setNoteBody('');
                  })
                }
              >
                {busy === 'note' ? 'Saving…' : 'Add note'}
              </button>
            </div>
            <ul className="max-h-48 divide-y divide-line overflow-y-auto border-t border-line">
              {notes.length === 0 && <li className="px-3 py-2 text-xs text-ink-muted">No notes yet.</li>}
              {notes.map((note) => (
                <li key={note.id} className="px-3 py-2">
                  <p className="text-sm">{note.body}</p>
                  <p className="text-[11px] text-ink-faint">{shortDate(note.created_at)}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}

function FeedbackForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (verdict: string, reason: string | null) => void;
}) {
  const [verdict, setVerdict] = useState<string>('interesting');
  const [reason, setReason] = useState<string>('');

  return (
    <div className="space-y-2 p-3">
      <p className="text-xs text-ink-muted">
        Your verdicts are stored to improve the scoring model over time.
      </p>
      <select className="input" value={verdict} onChange={(e) => setVerdict(e.target.value)}>
        {FEEDBACK_VERDICTS.map((option) => (
          <option key={option} value={option}>
            {titleCase(option)}
          </option>
        ))}
      </select>
      <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
        <option value="">No reason given</option>
        {FEEDBACK_REASONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <button className="btn-secondary" disabled={disabled} onClick={() => onSubmit(verdict, reason || null)}>
        Record feedback
      </button>
    </div>
  );
}
