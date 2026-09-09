'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function OnboardingForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const supabase = createClient();
    const { error: rpcError } = await supabase.rpc('create_institution', {
      institution_name: name.trim(),
    });

    if (rpcError) {
      setError(rpcError.message);
      setPending(false);
      return;
    }

    router.replace('/applications');
    router.refresh();
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-2xl border border-ink-200 bg-white p-6"
    >
      <div>
        <label htmlFor="institution" className="block text-sm font-semibold">
          Institution name
        </label>
        <input
          id="institution"
          required
          minLength={2}
          maxLength={200}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Nakuru Farmers SACCO"
          className="mt-1.5 w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm outline-none placeholder:text-ink-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-50"
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-danger-50 px-3 py-2 text-sm font-medium text-danger-700"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand-700 px-3 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60"
      >
        {pending ? 'Creating…' : 'Create institution'}
      </button>
    </form>
  );
}
