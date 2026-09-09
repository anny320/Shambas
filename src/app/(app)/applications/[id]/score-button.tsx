'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ScoreButton({
  applicationId,
  alreadyScored,
}: {
  applicationId: string;
  alreadyScored: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runScore() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/applications/${applicationId}/score`, {
        method: 'POST',
      });

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const message =
          typeof body === 'object' &&
          body !== null &&
          'error' in body &&
          typeof (body as { error: unknown }).error === 'string'
            ? (body as { error: string }).error
            : 'Scoring failed.';
        setError(message);
        setPending(false);
        return;
      }

      router.refresh();
      setPending(false);
    } catch {
      setError('Could not reach the server.');
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={runScore}
        disabled={pending}
        className="rounded-md bg-leaf-600 px-4 py-2 text-sm font-medium text-white hover:bg-leaf-700 disabled:opacity-60"
      >
        {pending
          ? 'Scoring…'
          : alreadyScored
            ? 'Score again'
            : 'Run credit score'}
      </button>
      {alreadyScored && !pending && (
        <span className="text-sm text-soil-700">
          Re-scoring keeps the earlier assessment in the audit trail.
        </span>
      )}
      {error && (
        <span role="alert" className="text-sm text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
