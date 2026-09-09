import { Suspense } from 'react';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in · Shamba Score' };

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-ink-50">
      <div className="rainbow-rule" />
      <main className="flex min-h-[calc(100vh-4px)] items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 text-center">
            <div
              className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-brand-500 text-3xl"
              aria-hidden="true"
            >
              🌾
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-ink-900">
              Shamba Score
            </h1>
            <p className="mt-1.5 text-sm text-ink-500">
              Credit decisioning for smallholder lending
            </p>
          </div>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
          <p className="mt-6 text-center text-xs text-ink-500">
            For lending institutions. Shamba Score is not a lender and does not
            provide credit to individuals.
          </p>
        </div>
      </main>
    </div>
  );
}
