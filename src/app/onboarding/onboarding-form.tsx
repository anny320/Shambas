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
      className="space-y-4 rounded-xl border border-soil-100 bg-white p-6 shadow-sm"
    >
      <div>
        <label htmlFor="institution" className="block text-sm font-medium">
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
          className="mt-1 w-full rounded-md border border-soil-100 px-3 py-2 text-sm outline-none focus:border-leaf-500 focus:ring-2 focus:ring-leaf-100"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-leaf-600 px-3 py-2 text-sm font-medium text-white hover:bg-leaf-700 disabled:opacity-60"
      >
        {pending ? 'Creating…' : 'Create institution'}
      </button>
    </form>
  );
}
