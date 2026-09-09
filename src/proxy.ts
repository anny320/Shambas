import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/session';

/**
 * Runs before every matched request. Next 16 calls this convention "proxy";
 * it was named "middleware" up to Next 15.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals and static assets, so every app route
     * and route handler passes through the session gate.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
