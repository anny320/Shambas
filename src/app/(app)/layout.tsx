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

  return (
    <div className="min-h-screen">
      <header className="border-b border-soil-100 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-baseline gap-3">
            <Link href="/applications" className="font-semibold tracking-tight">
              Shamba Score
            </Link>
            <span className="text-sm text-soil-700">{institution.name}</span>
          </div>

          <nav className="flex items-center gap-4 text-sm">
            <Link href="/applications" className="hover:underline">
              Applications
            </Link>
            <span className="hidden text-soil-700 sm:inline">
              {user.email} · {roleLabel}
            </span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-md border border-soil-100 px-2.5 py-1 hover:bg-soil-50"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
