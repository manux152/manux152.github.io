// Deploy: supabase functions deploy fan-join
// Public fan club sign-up: join (sends a confirmation email), confirm (from the email link), unsubscribe (from any newsletter).
// Needs the website address in site settings (site_url) and the email setup from Admin → Email design.
import { adminClient, commonVars, loadContext, logEmails, renderEmail, sendOne, type Tpl } from '../_shared/email.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const INTERESTS = ['news', 'matches', 'shop', 'events'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const body = await req.json().catch(() => ({}));
  const admin = adminClient();
  const token = typeof body.token === 'string' ? body.token.replace(/[^a-f0-9]/gi, '').slice(0, 80) : '';

  if (body.action === 'confirm') {
    if (token.length < 32) return json({ error: 'This link is not valid.' }, 400);
    const { data } = await admin.from('fans').select('id,status').eq('confirm_token', token).maybeSingle();
    if (!data) return json({ error: 'This link is not valid or has expired. Please sign up again.' }, 404);
    if (data.status !== 'active') await admin.from('fans').update({ status: 'active', confirmed_at: new Date().toISOString(), unsubscribed_at: null }).eq('id', data.id);
    return json({ ok: true });
  }

  if (body.action === 'unsubscribe') {
    if (token.length < 32) return json({ error: 'This link is not valid.' }, 400);
    const { data } = await admin.from('fans').select('id').eq('unsub_token', token).maybeSingle();
    if (!data) return json({ error: 'This link is not valid.' }, 404);
    await admin.from('fans').update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() }).eq('id', data.id);
    return json({ ok: true });
  }

  if (body.action !== 'join') return json({ error: 'Unknown request' }, 400);
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 200);
  const name = String(body.full_name ?? '').trim().slice(0, 120) || null;
  if (!EMAIL_RE.test(email)) return json({ error: 'Enter a valid email address.' }, 400);
  const interests = (Array.isArray(body.interests) ? body.interests : []).filter((i: unknown) => typeof i === 'string' && INTERESTS.includes(i)).slice(0, 4);
  const reply = { ok: true };   // same answer whether or not the address was already known, so nobody can probe the list

  const { data: existing } = await admin.from('fans').select('*').ilike('email', email).maybeSingle();
  let fan = existing;
  if (existing?.status === 'active') return json(reply);
  if (existing?.status === 'pending' && existing.confirm_sent_at && Date.now() - new Date(existing.confirm_sent_at).getTime() < 120_000) return json(reply);
  if (!existing) {
    const { data, error } = await admin.from('fans').insert({ email, full_name: name, interests, source: 'website' }).select().single();
    if (error) return json({ error: 'Could not sign you up right now. Please try again.' }, 500);
    fan = data;
  } else {
    const fresh = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
    const { data } = await admin.from('fans').update({ status: 'pending', full_name: name ?? existing.full_name, interests, confirm_token: fresh, unsubscribed_at: null }).eq('id', existing.id).select().single();
    fan = data ?? existing;
  }

  try {
    const ctx = await loadContext(admin);
    if (!ctx.enabled) throw new Error('Emails are switched off');
    const base = (ctx.appUrl || Deno.env.get('SITE_URL') || '').replace(/\/+$/, '');
    if (!/^https?:\/\//i.test(base)) throw new Error('The website address is not set');
    const tpl: Tpl = {
      subject: 'Confirm your email for the {team} fan club',
      body: 'Hi {first_name},\n\nThanks for joining the {team} fan club! Tap the button below to confirm your email address and start getting club news, match updates and offers.\n\nIf you didn\'t sign up, just ignore this email and nothing will happen.',
      button_label: 'Yes, count me in',
      button_url: `${base}/fan-confirm?token=${fan.confirm_token}`,
    };
    const m = renderEmail(tpl, commonVars(ctx, email, name), ctx.theme);
    await sendOne(ctx.theme, { to: email, subject: m.subject, html: m.html, text: m.text });
    await admin.from('fans').update({ confirm_sent_at: new Date().toISOString() }).eq('id', fan.id);
    await logEmails(admin, [{ template_key: 'fan_confirm', to_email: email, to_name: name, subject: m.subject, status: 'sent', kind: 'auth' }]);
    return json(reply);
  } catch (e) {
    await logEmails(admin, [{ template_key: 'fan_confirm', to_email: email, to_name: name, subject: 'Confirm fan club email', status: 'failed', error: String((e as Error).message ?? e), kind: 'auth' }]);
    return json({ error: 'We could not send the confirmation email right now. Please try again later.' }, 500);
  }
});
