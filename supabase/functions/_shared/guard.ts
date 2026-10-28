// Shared protection for public endpoints: Cloudflare Turnstile (CAPTCHA) check and per-IP / per-email rate limits.
// Needs the secret:  supabase secrets set TURNSTILE_SECRET_KEY=...   and migration 040 (rate_limit_hit).

/** The caller's address. Cloudflare's own header is preferred because the caller cannot fake it. */
export const clientIp = (req: Request): string =>
  (req.headers.get('cf-connecting-ip') ?? (req.headers.get('x-forwarded-for') ?? '').split(',')[0] ?? '').trim().slice(0, 64) || 'unknown';

/** Checks the CAPTCHA token with Cloudflare. If no secret is configured yet, it lets the request through (and logs a warning) so nothing breaks while you set it up. */
export async function verifyTurnstile(token: unknown, ip: string): Promise<{ ok: boolean; skipped?: boolean }> {
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY');
  if (!secret) { console.warn('TURNSTILE_SECRET_KEY is not set: the CAPTCHA is NOT being enforced'); return { ok: true, skipped: true }; }
  const t = String(token ?? '').slice(0, 2048);
  if (!t) return { ok: false };
  try {
    const body = new URLSearchParams({ secret, response: t });
    if (ip && ip !== 'unknown') body.set('remoteip', ip);
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const j = await r.json();
    return { ok: j?.success === true };
  } catch (e) { console.error('Turnstile verification failed:', e); return { ok: false }; }
}

/** true = allowed, false = over the limit. If the limiter itself fails (e.g. migration 040 not run yet) it lets people through, so a database problem never blocks real sign-ups. */
export async function allow(admin: any, key: string, limit: number, seconds: number): Promise<boolean> {
  const { data, error } = await admin.rpc('rate_limit_hit', { p_key: key, p_limit: limit, p_window_seconds: seconds });
  if (error) { console.error('rate_limit_hit failed:', error.message); return true; }
  return data !== false;
}
