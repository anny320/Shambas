import Link from 'next/link';
import { requireSession } from '@/lib/auth';

/**
 * Shell for every signed-in page. requireSession redirects anyone without a
 * session or without an institution, so children can assume both.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, membership, institution } = await requireSession();

  const roleLabel = {
    officer: 'Loan officer',
    head_of_credit: 'Head of credit',
    admin: 'Administrator',
  }[membership.role];

  // First letter of the institution, as a coloured mark. Gives the tenant a
  // visible identity so a user with access to two never mixes them up.
  const initial = institution.name.trim().charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-ink-50">
      <div className="rainbow-rule" />

      <header className="border-b border-ink-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/applications" className="flex items-center gap-2.5">
              <span
                className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-base font-bold text-white"
                aria-hidden="true"
              >
                {initial}
              </span>
              <span className="leading-tight">
                <span className="block text-sm font-bold tracking-tight text-ink-900">
                  {institution.name}
                </span>
                <span className="block text-xs text-ink-500">Shamba Score</span>
              </span>
            </Link>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink-500 sm:inline">
              {user.email}
            </span>
            <span className="hidden rounded-full bg-plum-50 px-2.5 py-1 text-xs font-semibold text-plum-700 sm:inline">
              {roleLabel}
            </span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-lg border border-ink-200 px-3 py-1.5 font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
