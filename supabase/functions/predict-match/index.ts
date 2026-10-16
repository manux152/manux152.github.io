// Deploy: supabase functions deploy predict-match
// Optional narrative: supabase secrets set ANTHROPIC_API_KEY=...  (and ANTHROPIC_MODEL to override)
// Schedule daily: Dashboard → Integrations → Cron → Edge Function → predict-match, body {"all":true}
//
// Model: Poisson goal model. Each side's attack/defence strength comes from league-table rows and our own
// results (shrunk toward the league average for small samples), with a home-advantage factor.
// It is an estimate from past scores only — it does not know injuries, form changes or lineups.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { activeLangRule, withLang } from '../_shared/lang.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const fact = (n: number) => { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
const pois = (l: number, k: number) => Math.exp(-l) * Math.pow(l, k) / fact(k);
const K = 4; // pseudo-games of league-average performance mixed into every sample

function outcome(lf: number, la: number) {
  let w = 0, d = 0, l = 0;
  for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10; j++) {
    const p = pois(lf, i) * pois(la, j);
    if (i > j) w += p; else if (i === j) d += p; else l += p;
  }
  const t = w + d + l;
  const win = Math.round((w / t) * 100), draw = Math.round((d / t) * 100);
  return { win, draw, loss: Math.max(0, 100 - win - draw) };
}
const shrink = (goals: number, games: number, avg: number) => (goals + K * avg) / (games + K);

async function predict(admin: any, m: any, teamName: string) {
  const oppName: string = m.opponents?.name ?? '';
  // Our results
  const { data: ours } = await admin.from('matches').select('goals_for,goals_against').eq('status', 'finished').not('goals_for', 'is', null);
  const ownGames = ours?.length ?? 0;
  const ownGF = (ours ?? []).reduce((a: number, r: any) => a + r.goals_for, 0), ownGA = (ours ?? []).reduce((a: number, r: any) => a + r.goals_against, 0);

  // League table rows (primary competition first)
  const { data: rows } = await admin.from('standings_rows').select('*, competitions!inner(is_primary,is_visible)')
    .ilike('team_name', oppName).order('competition_id');
  const opp = (rows ?? []).sort((a: any, b: any) => Number(b.competitions.is_primary) - Number(a.competitions.is_primary))[0];
  let avg = 1.35, ourRow: any = null;
  if (opp) {
    const { data: all } = await admin.from('standings_rows').select('played,goals_for,is_own_team,team_name').eq('competition_id', opp.competition_id);
    const gp = (all ?? []).reduce((a: number, r: any) => a + r.played, 0), gf = (all ?? []).reduce((a: number, r: any) => a + r.goals_for, 0);
    if (gp > 0) avg = gf / gp;
    ourRow = (all ?? []).find((r: any) => r.is_own_team || r.team_name.toLowerCase() === teamName.toLowerCase());
  }
  // Head-to-head as a fallback for the opponent
  const { data: h2h } = await admin.from('matches').select('goals_for,goals_against').eq('status', 'finished').eq('opponent_id', m.opponent_id).not('goals_for', 'is', null);

  // Our strength: bigger of league row / own results
  let ourGames = ownGames, ourGF = ownGF, ourGA = ownGA;
  if (ourRow && ourRow.played > ownGames) { ourGames = ourRow.played; ourGF = ourRow.goals_for; ourGA = ourRow.goals_against; }
  // Opponent strength
  let oppGames = 0, oppGF = 0, oppGA = 0, source = 'no data on this opponent';
  if (opp && opp.played > 0) { oppGames = opp.played; oppGF = opp.goals_for; oppGA = opp.goals_against; source = `${opp.team_name}'s ${opp.played} league games`; }
  else if (h2h?.length) { oppGames = h2h.length; oppGF = h2h.reduce((a: number, r: any) => a + r.goals_against, 0); oppGA = h2h.reduce((a: number, r: any) => a + r.goals_for, 0); source = `${h2h.length} past meeting(s)`; }

  const ourAtt = shrink(ourGF, ourGames, avg), ourDef = shrink(ourGA, ourGames, avg);
  const oppAtt = shrink(oppGF, oppGames, avg), oppDef = shrink(oppGA, oppGames, avg);
  const clamp = (x: number) => Math.min(4, Math.max(0.2, x));
  const lf = clamp(avg * (ourAtt / avg) * (oppDef / avg) * (m.is_home ? 1.1 : 0.92));
  const la = clamp(avg * (oppAtt / avg) * (ourDef / avg) * (m.is_home ? 0.92 : 1.1));
  const o = outcome(lf, la);
  const sample = Math.min(ourGames, oppGames);
  const confidence = sample >= 8 ? 'high' : sample >= 4 ? 'medium' : 'low';
  const basis = `Our ${ourGames} result(s) and ${source}`;

  let rationale: string | null = null;
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (key) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5', max_tokens: 200, messages: [{ role: 'user', content:
          `Write two short, friendly sentences for a football club app explaining this match estimate. Use ONLY the numbers below; do not invent players, injuries, form or news; say it is an estimate.\n` +
          `${teamName} (${m.is_home ? 'home' : 'away'}) vs ${oppName}. Win ${o.win}%, draw ${o.draw}%, loss ${o.loss}%. Expected goals ${lf.toFixed(1)}–${la.toFixed(1)}. Confidence ${confidence}. Based on: ${basis}.` + activeLangRule() }] }),
      });
      rationale = (await r.json()).content?.[0]?.text ?? null;
    } catch { /* narrative is optional */ }
  }

  const row = { match_id: m.id, win_pct: o.win, draw_pct: o.draw, loss_pct: o.loss, expected_goals_for: +lf.toFixed(2), expected_goals_against: +la.toFixed(2),
    confidence, basis, rationale, generated_at: new Date().toISOString() };
  const { error } = await admin.from('match_predictions').upsert(row);
  if (error) throw new Error(error.message);
  return row;
}

Deno.serve(withLang(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!, serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${serviceKey}`) {
    const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: ok } = await caller.rpc('has_permission', { perm: 'matches.manage' });
    if (!ok) return json({ error: 'Forbidden' }, 403);
  }
  const body = await req.json().catch(() => ({}));
  const admin = createClient(url, serviceKey);
  const { data: t } = await admin.from('site_settings').select('value').eq('key', 'team_name').maybeSingle();
  const teamName = typeof t?.value === 'string' ? t.value : 'Our team';

  let q = admin.from('matches').select('*, opponents(name)').eq('status', 'scheduled');
  if (body.match_id) q = q.eq('id', body.match_id);
  else q = q.gte('kickoff_at', new Date().toISOString()).lte('kickoff_at', new Date(Date.now() + 30 * 864e5).toISOString());
  const { data: matches } = await q;
  if (!matches?.length) return json({ error: 'No matching scheduled matches' }, 400);
  try {
    const out = [];
    for (const m of matches) out.push(await predict(admin, m, teamName));
    return json({ predictions: out });
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
}));
