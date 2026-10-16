// Deploy: supabase functions deploy sync-standings
// API keys go in function secrets whose names start with LEAGUE_API_, e.g.
//   supabase secrets set LEAGUE_API_FOOTBALL_DATA=your-key
// Schedule daily: Dashboard → Integrations → Cron → Edge Function → sync-standings, body {"all":true}
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const get = (o: any, path?: string) => (path ? path.split('.').reduce((a: any, k) => (a == null ? undefined : a[k]), o) : undefined);
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : 0; };

// Only LEAGUE_API_* secrets can be injected, so admins can never exfiltrate other keys.
const fill = (s: string) => s.replace(/\{\{(LEAGUE_API_[A-Z0-9_]+)\}\}/g, (_m, name) => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Secret ${name} is not set on the function`);
  return v;
});

function safeUrl(u: string) {
  const x = new URL(u);
  const h = x.hostname;
  if (x.protocol !== 'https:') throw new Error('Only https API URLs are allowed');
  if (h === 'localhost' || h.endsWith('.internal') || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) throw new Error('That API host is not allowed');
  return x.toString();
}

async function syncOne(admin: any, comp: any, defaultOwn: string) {
  const { data: prov } = await admin.from('api_providers').select('*').eq('id', comp.provider_id).maybeSingle();
  if (!prov) throw new Error('No API provider selected for this competition');
  const cfg = comp.config ?? {};
  let url = (prov.url_template as string)
    .replace('{league}', encodeURIComponent(cfg.league ?? ''))
    .replace('{season}', encodeURIComponent(comp.season ?? cfg.season ?? ''));
  url = fill(url);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(prov.headers ?? {})) headers[k] = fill(String(v));
  const res = await fetch(safeUrl(url), { headers, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`The provider returned HTTP ${res.status}`);
  const list = get(await res.json(), prov.rows_path);
  if (!Array.isArray(list) || !list.length) throw new Error('No standings found at the configured rows path');

  const m = prov.field_map ?? {};
  const own = String(cfg.own_team_name ?? defaultOwn ?? '').toLowerCase();
  const rows = list.map((r: any, i: number) => {
    const gf = num(get(r, m.goals_for)), ga = num(get(r, m.goals_against));
    const name = String(get(r, m.team_name) ?? '');
    return {
      competition_id: comp.id, position: num(get(r, m.position)) || i + 1, team_name: name,
      team_logo: m.team_logo ? get(r, m.team_logo) ?? null : null,
      played: num(get(r, m.played)), won: num(get(r, m.won)), drawn: num(get(r, m.drawn)), lost: num(get(r, m.lost)),
      goals_for: gf, goals_against: ga, goal_diff: m.goal_diff ? num(get(r, m.goal_diff)) : gf - ga,
      points: num(get(r, m.points)), form: m.form ? (String(get(r, m.form) ?? '') || null) : null,
      is_own_team: !!own && name.toLowerCase() === own,
    };
  });
  await admin.from('standings_rows').delete().eq('competition_id', comp.id);
  const { error } = await admin.from('standings_rows').insert(rows);
  if (error) throw new Error(error.message);
  await admin.from('competitions').update({ last_synced_at: new Date().toISOString(), sync_error: null }).eq('id', comp.id);
  return rows.length;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!, serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${serviceKey}`) {
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: ok } = await caller.rpc('has_permission', { perm: 'competitions.manage' });
    if (!ok) return json({ error: 'Forbidden' }, 403);
  }
  const body = await req.json().catch(() => ({}));
  const admin = createClient(url, serviceKey);
  const { data: t } = await admin.from('site_settings').select('value').eq('key', 'team_name').maybeSingle();
  const defaultOwn = typeof t?.value === 'string' ? t.value : '';

  let q = admin.from('competitions').select('*').eq('source', 'api');
  if (body.competition_id) q = q.eq('id', body.competition_id); else q = q.eq('auto_sync', true);
  const { data: comps } = await q;
  if (!comps?.length) return json({ error: 'No matching API competitions' }, 400);

  const results: any[] = [];
  for (const c of comps) {
    try { results.push({ id: c.id, rows: await syncOne(admin, c, defaultOwn) }); }
    catch (e) {
      const msg = String((e as Error).message ?? e);
      await admin.from('competitions').update({ sync_error: msg }).eq('id', c.id);
      results.push({ id: c.id, error: msg });
    }
  }
  const failed = results.filter((r) => r.error);
  return json({ results }, body.competition_id && failed.length ? 400 : 200);
});
