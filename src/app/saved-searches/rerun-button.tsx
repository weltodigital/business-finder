'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function RerunButton({ thesisId }: { thesisId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rerun() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/theses/${thesisId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? 'Could not start the run.');
      router.push(`/search/${payload.runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      {error && <span className="text-xs text-bad">{error}</span>}
      <button className="text-xs text-accent hover:underline" disabled={busy} onClick={() => void rerun()}>
        {busy ? 'Starting…' : 'Run again'}
      </button>
    </span>
  );
}
