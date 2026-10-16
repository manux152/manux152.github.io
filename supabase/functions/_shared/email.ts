// Shared email helpers: theme, safe template rendering, Resend delivery, logging.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const FALLBACK_FONT = 'Arial, Helvetica, sans-serif';
export const DEFAULT_THEME = {
  from_name: '', from_address: '', reply_to: '', logo_url: '', google_font: '', font_family: FALLBACK_FONT,
  primary_color: '#0B6E4F', background_color: '#F4F5F7', card_color: '#FFFFFF', text_color: '#222222',
  button_text_color: '#FFFFFF', footer_text: '', radius: 12,
};
export type Theme = typeof DEFAULT_THEME;
export type Tpl = { subject: string; body: string; button_label?: string | null; button_url?: string | null };
export type Ctx = { theme: Theme; team: string; appUrl: string; enabled: boolean };
export type Msg = { to: string; subject: string; html: string; text: string };

export const adminClient = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

export async function loadContext(admin: any): Promise<Ctx> {
  const [{ data: es }, { data: st }] = await Promise.all([
    admin.from('email_settings').select('*').eq('id', 1).maybeSingle(),
    admin.from('site_settings').select('key,value').in('key', ['team_name', 'site_url', 'logo_url']),
  ]);
  const s: Record<string, any> = Object.fromEntries((st ?? []).map((r: any) => [r.key, r.value]));
  const theme = { ...DEFAULT_THEME, ...(es?.theme ?? {}) } as Theme;
  const team = typeof s.team_name === 'string' && s.team_name ? s.team_name : 'Our team';
  if (!theme.from_name) theme.from_name = team;
  if (!theme.logo_url && typeof s.logo_url === 'string') theme.logo_url = s.logo_url;
  return { theme, team, appUrl: typeof s.site_url === 'string' ? s.site_url : '', enabled: es?.emails_enabled ?? true };
}

export function commonVars(ctx: Ctx, email: string, name?: string | null): Record<string, string> {
  const nm = (name ?? '').trim();
  return { team: ctx.team, app_url: ctx.appUrl, email, name: nm || 'there', first_name: nm.split(/\s+/)[0] || 'there' };
}

export const SAMPLE_VARS: Record<string, string> = {
  action_url: 'https://example.com/sample-link', tryout_title: 'Open tryout', tryout_date: 'Saturday 14 November 2026, 09:00',
  tryout_location: 'Main pitch', code: 'SS-ABCD-EFGH', expires_on: '14 December 2026', note: 'Well done!',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const color = (c: string, d: string) => (/^#[0-9a-fA-F]{3,8}$/.test(String(c)) ? c : d);
const fontStack = (t: Theme) => {
  const base = String(t.font_family || FALLBACK_FONT).replace(/[^\w\s,'"-]/g, '') || FALLBACK_FONT;
  return /^[A-Za-z0-9 ]+$/.test(t.google_font || '') && t.google_font ? `'${t.google_font}', ${base}` : base;
};
const httpUrl = (u: string) => (/^https?:\/\/[^\s"<>]+$/i.test(u) ? u : null);

// Values are HTML-escaped and have markdown characters neutralised, so names can never inject links or markup.
export function renderEmail(tpl: Tpl, vars: Record<string, string>, theme: Theme, opts: { optOutNote?: boolean } = {}) {
  const safe: Record<string, string> = {};
  for (const [k, v] of Object.entries(vars)) safe[k] = esc(String(v ?? '')).replace(/[*\[\]()]/g, (c) => `&#${c.charCodeAt(0)};`);
  const primary = color(theme.primary_color, '#0B6E4F'), bg = color(theme.background_color, '#F4F5F7'), card = color(theme.card_color, '#FFFFFF');
  const text = color(theme.text_color, '#222222'), btnText = color(theme.button_text_color, '#FFFFFF');
  const radius = Math.max(0, Math.min(32, Number(theme.radius) || 0));
  const font = fontStack(theme);

  const subject = tpl.subject.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? '')).replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
  const md = (s: string) => s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, l, u) => `<a href="${u}" style="color:${primary};">${l}</a>`);
  const paras = esc(tpl.body).replace(/\{(\w+)\}/g, (_m, k) => safe[k] ?? '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:${text};">${md(p).replace(/\n/g, '<br>')}</p>`).join('');

  const btnUrl = tpl.button_url ? httpUrl(tpl.button_url.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? ''))) : null;
  const btnLabel = (tpl.button_label ?? '').replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? '')).trim();
  const button = btnUrl && btnLabel
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;"><tr><td style="background:${primary};border-radius:${Math.min(radius, 10)}px;">
       <a href="${esc(btnUrl)}" style="display:inline-block;padding:13px 26px;font-weight:700;font-size:16px;color:${btnText};text-decoration:none;">${esc(btnLabel)}</a></td></tr></table>
       <p style="margin:0 0 8px;font-size:12px;color:#888;">Button not working? Copy this link: <span style="word-break:break-all;">${esc(btnUrl)}</span></p>` : '';

  const logo = theme.logo_url && httpUrl(theme.logo_url)
    ? `<img src="${esc(theme.logo_url)}" alt="${esc(vars.team ?? '')}" style="max-height:48px;max-width:200px;display:block;">`
    : `<span style="font-size:22px;font-weight:800;color:${primary};">${esc(vars.team ?? '')}</span>`;
  const footerBits = [theme.footer_text ? esc(theme.footer_text).replace(/\n/g, '<br>') : '',
    opts.optOutNote ? 'You can turn off team emails in the app under Account → Team emails.' : ''].filter(Boolean).join('<br><br>');
  const fontLink = /^[A-Za-z0-9 ]+$/.test(theme.google_font || '') && theme.google_font
    ? `<link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.google_font)}:wght@400;700&display=swap" rel="stylesheet">` : '';

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${fontLink}<title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${bg};font-family:${font};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${card};border-radius:${radius}px;border-top:5px solid ${primary};">
<tr><td style="padding:24px 28px 8px;">${logo}</td></tr>
<tr><td style="padding:12px 28px 8px;font-family:${font};">${paras}${button}</td></tr>
<tr><td style="padding:8px 28px 24px;font-size:12px;line-height:1.5;color:#888;font-family:${font};">${footerBits}</td></tr>
</table></td></tr></table></body></html>`;

  const plain = tpl.body.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? '')).replace(/\*\*(.+?)\*\*/g, '$1').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '$1 ($2)');
  const textOut = `${plain}${btnUrl && btnLabel ? `\n\n${btnLabel}: ${btnUrl}` : ''}${theme.footer_text ? `\n\n${theme.footer_text}` : ''}`;
  return { subject, html, text: textOut };
}

// ── Delivery via Resend (https://resend.com). Secret: RESEND_API_KEY. Sender comes from Admin → Email design.
function envelope(theme: Theme) {
  if (!theme.from_address) throw new Error('Set the sender email address in Admin → Email design first');
  return { from: `${theme.from_name} <${theme.from_address}>`, ...(theme.reply_to ? { reply_to: theme.reply_to } : {}) };
}
async function resend(path: string, theme: Theme, payload: unknown) {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) throw new Error('RESEND_API_KEY is not set on the function');
  const res = await fetch(`https://api.resend.com${path}`, { method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error(`Email provider error ${res.status}: ${(await res.text()).slice(0, 160)}`);
}
export const sendOne = (theme: Theme, m: Msg) => resend('/emails', theme, { ...envelope(theme), to: [m.to], subject: m.subject, html: m.html, text: m.text });
export const sendBatch = (theme: Theme, ms: Msg[]) => resend('/emails/batch', theme, ms.map((m) => ({ ...envelope(theme), to: [m.to], subject: m.subject, html: m.html, text: m.text })));

export async function logEmails(admin: any, rows: any[]) { if (rows.length) await admin.from('email_log').insert(rows); }
