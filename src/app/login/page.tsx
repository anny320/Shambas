import { Suspense } from 'react';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in · Shamba Score' };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Shamba Score</h1>
          <p className="mt-1 text-sm text-soil-700">
            Credit decisioning for smallholder lending
          </p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
