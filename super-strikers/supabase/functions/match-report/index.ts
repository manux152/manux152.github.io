// Deploy: supabase functions deploy match-report
// Optional AI wording: supabase secrets set ANTHROPIC_API_KEY=...   (ANTHROPIC_MODEL overrides the default)
// Without a key it still works: the report is assembled from the match events in plain wording.
// The AI is only given facts read from your own database and told not to invent anything. Staff always review before saving.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { activeLangRule, withLang } from '../_shared/lang.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const clip = (s: unknown, n = 4000) => String(s ?? '').slice(0, n);

async function ask(system: string, user: string): Promise<string | null> {
  const key = Deno.env.get('ANTHROPIC_API_KEY'); if (!key) return null;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5', max_tokens: 900, system: system + activeLangRule(), messages: [{ role: 'user', content: user }] }) });
    const txt: string = (await r.json()).content?.[0]?.text ?? '';
    return txt.trim() || null;
  } catch { return null; }
}

Deno.serve(withLang(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: ok } = await caller.rpc('has_permission', { perm: 'matches.manage' });
  if (!ok) return json({ error: 'Forbidden' }, 403);
  const body = await req.json().catch(() => ({}));
  const id = String(body.match_id ?? ''); if (!id) return json({ error: 'match_id is required' }, 400);
  const tone = ['professional', 'enthusiastic', 'friendly'].includes(body.tone) ? body.tone : 'friendly';
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const { data: m } = await admin.from('matches').select('*, opponents(name), motm:players!matches_motm_player_id_fkey(full_name)').eq('id', id).maybeSingle();
    if (!m) return json({ error: 'Match not found' }, 404);
    if (m.status !== 'finished') return json({ error: 'The match has not finished yet.' }, 400);
    const { data: team } = await admin.from('site_settings').select('value').eq('key', 'team_name').maybeSingle();
    const us = typeof team?.value === 'string' ? team.value : 'the team';
    const { data: ev } = await admin.from('match_events').select('minute, notes, event_types(label,stat_key), player:players!match_events_player_id_fkey(full_name), assist:players!match_events_related_player_id_fkey(full_name)').eq('match_id', id).order('minute');
    const { data: comm } = await admin.from('match_commentary').select('minute, body, kind').eq('match_id', id).in('kind', ['comment', 'chance']).order('created_at').limit(30);

    const opp = m.opponents?.name ?? 'the opposition';
    const gf = m.goals_for ?? 0, ga = m.goals_against ?? 0;
    const result = gf > ga ? 'won' : gf < ga ? 'lost' : 'drew';
    const lines = (ev ?? []).map((e: any) => `${e.minute != null ? e.minute + "' " : ''}${e.event_types?.label}${e.player?.full_name ? ' — ' + e.player.full_name : ''}${e.assist?.full_name ? ' (assist ' + e.assist.full_name + ')' : ''}${e.notes ? ' — ' + e.notes : ''}`);
    const facts = [
      `${us} ${result} ${gf}-${ga} ${m.is_home ? 'at home against' : 'away at'} ${opp}`,
      m.competition ? `Competition: ${m.competition}` : '', m.venue ? `Venue: ${m.venue}` : '',
      ...lines.map((l: string) => `Event: ${l}`),
      ...(comm ?? []).map((c: any) => `Staff note: ${c.minute != null ? c.minute + "' " : ''}${c.body}`),
      m.motm?.full_name ? `Man of the Match (fans' vote): ${m.motm.full_name}` : '',
    ].filter(Boolean);

    const plain = `${us} ${result} ${gf}-${ga} ${m.is_home ? 'at home against' : 'away at'} ${opp}.` + (lines.length ? `\n\n${lines.join('\n')}` : '') + (m.motm?.full_name ? `\n\nMan of the Match: ${m.motm.full_name}.` : '');
    const ai = await ask(
      `You write short match reports for ${us}, a community football club, in a ${tone} tone. Use ONLY the facts provided. Never invent scorers, minutes, quotes, injuries, tactics, names or statistics. If a detail is missing, leave it out. No hashtags, no emojis. Plain text, 2-3 short paragraphs (about 100-160 words).`,
      `Write the match report.\nFACTS:\n- ${facts.join('\n- ')}${body.notes ? `\nEDITOR'S NOTE (follow it, but do not add facts that are not in it): ${clip(body.notes, 500)}` : ''}`);
    return json({ report: clip(ai ?? plain), ai: !!ai });
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
}));
