import type { Session } from '@supabase/supabase-js';

// True when this sign-in has a verified 2FA factor but the 6-digit code has not been entered yet (session is still "aal1").
// Read straight from the session (no network call), so it is safe to use inside auth listeners. Any doubt → false, so nobody gets locked out by a decoding problem.
export function needsMfa(s: Session | null): boolean {
  try {
    if (!s) return false;
    const hasFactor = (s.user?.factors ?? []).some((f: any) => f.status === 'verified');
    if (!hasFactor) return false;
    const part = s.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function' ? atob(part + '='.repeat((4 - (part.length % 4)) % 4)) : '';
    return json ? JSON.parse(json).aal !== 'aal2' : false;
  } catch { return false; }
}
