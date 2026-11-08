// Deploy: supabase functions deploy friendly-request
// Public "Request a friendly match" form. Protected with Cloudflare Turnstile (action "friendly_request") and rate limits,
// like fan-join. Needs TURNSTILE_SECRET_KEY and migration 040 (rate_limit_hit) and migration 044 (friendly_requests + friendly-logos bucket).
// The team logo is REQUIRED: it is checked here (real PNG / JPEG / WebP, at most 1.5 MB) and stored in the public `friendly-logos` bucket.
import { adminClient } from '../_shared/email.ts';
import { allow, clientIp, verifyTurnstile } from '../_shared/guard.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VENUES = ['their_ground', 'our_ground', 'either'];
const MAX_LOGO_BYTES = 1_500_000;

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

// Look at the first bytes, not at what the browser claims, so only real pictures get stored.
function sniff(b: Uint8Array): { mime: string; ext: string } | null {
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { mime: 'image/png', ext: 'png' };
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { mime: 'image/webp', ext: 'webp' };
  return null;
}

function validDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(s + 'T12:00:00Z'); if (isNaN(d.getTime())) return false;
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const days = (d.getTime() - today.getTime()) / 86_400_000;
  return days >= -1 && days <= 366;          // from today (allowing for time zones) up to a year ahead
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Unknown request' }, 405);
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();
  const ip = clientIp(req);

  // Bots fill every box; people never see this one. Pretend it worked.
  if (clean(body.website, 50)) return json({ ok: true });

  const team = clean(body.team_name, 80), contact = clean(body.contact_name, 80);
  const email = clean(body.contact_email, 200).toLowerCase();
  const phone = clean(body.contact_phone, 40) || null, age = clean(body.age_group, 40) || null;
  const d1 = clean(body.date_option_1, 10), d2 = clean(body.date_option_2, 10) || null;
  const timeNote = clean(body.time_note, 80) || null;
  const venue = VENUES.includes(body.venue_pref) ? body.venue_pref : 'either';
  const message = clean(body.message, 1000) || null;

  if (team.length < 2) return json({ error: 'Enter your team name.' }, 400);
  if (contact.length < 2) return json({ error: 'Enter a contact name.' }, 400);
  if (!EMAIL_RE.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
  if (!validDate(d1)) return json({ error: 'Choose a date from today onwards.' }, 400);
  if (d2 && !validDate(d2)) return json({ error: 'The second date is not valid.' }, 400);

  // The logo is required.
  const rawLogo = String(body.logo_base64 ?? '').replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  if (!rawLogo) return json({ error: 'Please upload your team logo. It is required.' }, 400);
  if (rawLogo.length > Math.ceil(MAX_LOGO_BYTES * 4 / 3) + 8) return json({ error: 'The logo is too big. Please use a smaller picture (under 1.5 MB).' }, 400);
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(rawLogo), (c) => c.charCodeAt(0)); } catch { return json({ error: 'The logo could not be read. Please choose a PNG or JPG picture.' }, 400); }
  if (bytes.length > MAX_LOGO_BYTES) return json({ error: 'The logo is too big. Please use a smaller picture (under 1.5 MB).' }, 400);
  const kind = sniff(bytes);
  if (!kind) return json({ error: 'The logo must be a PNG, JPG or WebP picture.' }, 400);

  // Protection against bots and mail-bombing: limits per address and per email, then the CAPTCHA.
  if (!(await allow(admin, `friendly:ip:${ip}`, 5, 3600)) || !(await allow(admin, `friendly:email:${email}`, 3, 86400))) {
    return json({ error: 'Too many requests. Please wait a while and try again.' }, 429);
  }
  const cap = await verifyTurnstile(body.turnstile_token, ip, 'friendly_request');
  if (!cap.ok) return json({ error: 'Please complete the “I am not a robot” check and try again.' }, 400);

  // The same team asking twice in a day is treated as done (same answer, so nobody can probe the list).
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const { data: dup } = await admin.from('friendly_requests').select('id').eq('status', 'pending').ilike('contact_email', email).ilike('team_name', team).gte('created_at', since).limit(1);
  if (dup?.length) return json({ ok: true });

  const path = `requests/${crypto.randomUUID()}.${kind.ext}`;
  const up = await admin.storage.from('friendly-logos').upload(path, bytes, { contentType: kind.mime, cacheControl: '31536000', upsert: false });
  if (up.error) { console.error('logo upload failed:', up.error.message); return json({ error: 'Could not save the logo right now. Please try again.' }, 500); }
  const logoUrl = admin.storage.from('friendly-logos').getPublicUrl(path).data.publicUrl;

  const { error } = await admin.from('friendly_requests').insert({
    team_name: team, age_group: age, contact_name: contact, contact_email: email, contact_phone: phone,
    date_option_1: d1, date_option_2: d2, time_note: timeNote, venue_pref: venue, message, logo_url: logoUrl,
  });
  if (error) {
    await admin.storage.from('friendly-logos').remove([path]);      // don't leave an orphan picture behind
    console.error('friendly request insert failed:', error.message);
    return json({ error: 'Could not send your request right now. Please try again.' }, 500);
  }
  return json({ ok: true });
});
