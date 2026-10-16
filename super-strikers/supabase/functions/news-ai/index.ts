// Deploy: supabase functions deploy news-ai
// Optional AI wording: supabase secrets set ANTHROPIC_API_KEY=...   (ANTHROPIC_MODEL overrides the default)
// Without a key it still works: drafts are assembled from your data with plain wording.
// The AI is only given facts read from your own database (results, events, awards, tryouts, shop) and told not to invent anything.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { activeLangRule, withLang } from '../_shared/lang.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const clip = (s: unknown, n = 600) => String(s ?? '').slice(0, n);
const fmtDay = (d: string) => new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const fmtTime = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';

const ord = (n: number) => { const v = n % 100; return n + (['th', 'st', 'nd', 'rd'][(v - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][v] ?? 'th'); };
type Draft = { title: string; summary: string; body: string; category: string };
type Facts = { category: string; facts: string[]; fallback: Draft };

async function ask(system: string, user: string): Promise<any | null> {
  const key = Deno.env.get('ANTHROPIC_API_KEY'); if (!key) return null;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5', max_tokens: 1400, system: system + activeLangRule(), messages: [{ role: 'user', content: user }] }) });
    const txt: string = (await r.json()).content?.[0]?.text ?? '';
    const m = txt.match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null;
  } catch { return null; }
}
const LEN: Record<string, string> = { short: '2 short paragraphs (about 80-120 words)', medium: '3-4 short paragraphs (about 180-250 words)', long: '5-6 short paragraphs (about 300-400 words)' };
const SYSTEM = (team: string, tone: string) => `You are the media officer of ${team}, a community football club, writing news for the club website. Write in a ${tone} tone. Use ONLY the facts provided. Never invent scores, scorers, minutes, quotes, injuries, names, dates or statistics. If a detail is missing, leave it out. No hashtags, no emojis. Reply with JSON only.`;
const ask2 = (team: string, tone: string, length: string, kind: string, facts: string[], notes: string) =>
  ask(SYSTEM(team, tone), `Write a news story (${kind}).\nFACTS:\n- ${facts.join('\n- ')}\n${notes ? `EDITOR'S NOTE (follow it, but do not add facts that are not in it): ${notes}\n` : ''}Length: ${LEN[length] ?? LEN.medium}.\nReply as JSON: {"title":"headline under 80 characters","summary":"one sentence under 200 characters","body":"paragraphs separated by a blank line","category":"short category"}`);

async function teamName(admin: any) { const { data } = await admin.from('site_settings').select('value').eq('key', 'team_name').maybeSingle(); return typeof data?.value === 'string' ? data.value : 'the club'; }

// ───────── story ideas, built from what is in the system right now ─────────
async function sources(admin: any) {
  const ideas: { kind: string; ref_id: string | null; label: string; hint: string }[] = [];
  const { data: done } = await admin.from('matches').select('id,kickoff_at,goals_for,goals_against,is_home,opponents(name)').eq('status', 'finished').order('kickoff_at', { ascending: false }).limit(3);
  (done ?? []).forEach((m: any) => ideas.push({ kind: 'match_report', ref_id: m.id, label: `Match report: ${m.is_home ? 'vs' : '@'} ${m.opponents?.name} (${m.goals_for ?? '?'}–${m.goals_against ?? '?'})`, hint: fmtDay(m.kickoff_at) }));
  const { data: next } = await admin.from('matches').select('id,kickoff_at,is_home,opponents(name)').eq('status', 'scheduled').gte('kickoff_at', new Date().toISOString()).order('kickoff_at').limit(2);
  (next ?? []).forEach((m: any) => ideas.push({ kind: 'match_preview', ref_id: m.id, label: `Match preview: ${m.is_home ? 'vs' : '@'} ${m.opponents?.name}`, hint: fmtDay(m.kickoff_at) }));
  const { data: aw } = await admin.from('awards').select('id,period_label,award_types(label),players(full_name)').eq('is_published', true).order('awarded_on', { ascending: false }).limit(2);
  (aw ?? []).forEach((a: any) => ideas.push({ kind: 'award', ref_id: a.id, label: `${a.award_types?.label}: ${a.players?.full_name ?? 'winner'}`, hint: a.period_label }));
  const { data: sc } = await admin.from('player_stats').select('goals').gt('goals', 0).limit(1);
  if (sc?.length) ideas.push({ kind: 'top_scorers', ref_id: null, label: 'Top scorers and assist leaders', hint: 'From all recorded match events' });
  const { data: comp } = await admin.from('competitions').select('id,name').eq('is_visible', true).order('is_primary', { ascending: false }).limit(1);
  if (comp?.length) ideas.push({ kind: 'standings', ref_id: comp[0].id, label: `League update: ${comp[0].name}`, hint: 'Current table position' });
  const { data: tr } = await admin.from('tryouts').select('id,title,starts_at').eq('is_published', true).gte('starts_at', new Date().toISOString()).order('starts_at').limit(2);
  (tr ?? []).forEach((t: any) => ideas.push({ kind: 'tryout', ref_id: t.id, label: `Tryout: ${t.title}`, hint: fmtDay(t.starts_at) }));
  const { data: pr } = await admin.from('products').select('id,name').eq('is_active', true).order('created_at', { ascending: false }).limit(2);
  (pr ?? []).forEach((p: any) => ideas.push({ kind: 'product', ref_id: p.id, label: `In the shop: ${p.name}`, hint: 'Merchandise announcement' }));
  return { ideas };
}

// ───────── facts for each kind of story ─────────
async function gather(admin: any, kind: string, ref: string | null, team: string, topic: string): Promise<Facts> {
  if (kind === 'match_report' || kind === 'match_preview') {
    const { data: m } = await admin.from('matches').select('*, opponents(name)').eq('id', ref).maybeSingle(); if (!m) throw new Error('Match not found');
    const opp = m.opponents?.name ?? 'the opposition'; const where = m.is_home ? 'at home' : 'away';
    const base = [`${team} ${m.is_home ? 'host' : 'visit'} ${opp}`, `Date: ${fmtDay(m.kickoff_at)}`, m.venue ? `Venue: ${m.venue}` : '', m.competition ? `Competition: ${m.competition}` : ''].filter(Boolean);
    if (kind === 'match_report') {
      const { data: ev } = await admin.from('match_events').select('minute,notes,event_types(label,stat_key),player:players!match_events_player_id_fkey(full_name),assist:players!match_events_related_player_id_fkey(full_name)').eq('match_id', ref).order('minute');
      const lines = (ev ?? []).map((e: any) => `${e.minute != null ? e.minute + "'" : ''} ${e.event_types?.label ?? 'Event'}${e.player?.full_name ? ' — ' + e.player.full_name : ''}${e.assist?.full_name ? ' (assist ' + e.assist.full_name + ')' : ''}${e.notes ? ': ' + e.notes : ''}`.trim());
      const facts = [...base, `Final score: ${team} ${m.goals_for ?? '?'} – ${m.goals_against ?? '?'} ${opp}`, ...(m.report ? [`Coach's match report notes: ${clip(m.report, 1200)}`] : []), ...lines.map((l: string) => `Event: ${l}`)];
      const res = m.goals_for == null ? 'played' : m.goals_for > m.goals_against ? 'beat' : m.goals_for < m.goals_against ? 'lost to' : 'drew with';
      return { category: 'Match report', facts, fallback: { title: `${team} ${m.goals_for ?? ''}–${m.goals_against ?? ''} ${opp}`.replace('–', ' – '), summary: `${team} ${res} ${opp} ${where} on ${fmtDay(m.kickoff_at)}.`,
        body: [`${team} ${res} ${opp} ${where}${m.competition ? ' in the ' + m.competition : ''}, with a final score of ${m.goals_for ?? '?'}–${m.goals_against ?? '?'}.`, lines.length ? `Match events:\n${lines.join('\n')}` : '', m.report ?? ''].filter(Boolean).join('\n\n'), category: 'Match report' } };
    }
    const { data: pred } = await admin.from('match_predictions').select('*').eq('match_id', ref).maybeSingle();
    const { data: recent } = await admin.from('matches').select('goals_for,goals_against,is_home,opponents(name)').eq('status', 'finished').order('kickoff_at', { ascending: false }).limit(5);
    const { data: h2h } = await admin.from('matches').select('kickoff_at,goals_for,goals_against').eq('status', 'finished').eq('opponent_id', m.opponent_id).order('kickoff_at', { ascending: false }).limit(3);
    const facts = [...base, `Kick-off: ${fmtTime(m.kickoff_at)}`,
      ...(recent?.length ? [`Our last results: ${recent.map((r: any) => `${r.goals_for}–${r.goals_against} ${r.is_home ? 'vs' : '@'} ${r.opponents?.name}`).join('; ')}`] : []),
      ...(h2h?.length ? [`Previous meetings with ${opp}: ${h2h.map((r: any) => `${fmtDay(r.kickoff_at)} ${r.goals_for}–${r.goals_against}`).join('; ')}`] : []),
      ...(pred ? [`Our model's estimate: win ${pred.win_pct}%, draw ${pred.draw_pct}%, loss ${pred.loss_pct}% (confidence ${pred.confidence}) — present as an estimate, not a promise`] : [])];
    return { category: 'Match preview', facts, fallback: { title: `Preview: ${team} ${m.is_home ? 'v' : 'at'} ${opp}`, summary: `${team} ${m.is_home ? 'host' : 'travel to face'} ${opp} on ${fmtDay(m.kickoff_at)}.`,
      body: facts.join('\n'), category: 'Match preview' } };
  }
  if (kind === 'award') {
    const { data: a } = await admin.from('awards').select('*, award_types(label), players(id,full_name)').eq('id', ref).maybeSingle(); if (!a) throw new Error('Award not found');
    const { data: st } = a.players?.id ? await admin.from('player_stats').select('goals,assists,appearances').eq('player_id', a.players.id).maybeSingle() : { data: null };
    const facts = [`Award: ${a.award_types?.label}`, `Winner: ${a.players?.full_name ?? 'to be announced'}`, `Period: ${a.period_label}`, ...(a.note ? [`Reason: ${a.note}`] : []), ...(st ? [`Season record so far: ${st.appearances} appearances, ${st.goals} goals, ${st.assists} assists`] : [])];
    return { category: 'Awards', facts, fallback: { title: `${a.players?.full_name ?? 'Winner'} wins ${a.award_types?.label}`, summary: `${a.players?.full_name ?? 'The winner'} takes ${a.award_types?.label} for ${a.period_label}.`, body: facts.join('\n'), category: 'Awards' } };
  }
  if (kind === 'top_scorers') {
    const { data: s } = await admin.from('player_stats').select('full_name,goals,assists,appearances').order('goals', { ascending: false }).limit(5);
    const { data: ast } = await admin.from('player_stats').select('full_name,assists').order('assists', { ascending: false }).limit(3);
    const facts = [...(s ?? []).filter((p: any) => p.goals > 0).map((p: any, i: number) => `Scorer #${i + 1}: ${p.full_name} — ${p.goals} goals in ${p.appearances} appearances`), ...(ast ?? []).filter((p: any) => p.assists > 0).map((p: any) => `Assists: ${p.full_name} — ${p.assists}`)];
    if (!facts.length) throw new Error('No goals or assists have been recorded yet');
    return { category: 'Stats', facts, fallback: { title: `${team} scoring charts`, summary: 'Who is leading the way for goals and assists.', body: facts.join('\n'), category: 'Stats' } };
  }
  if (kind === 'standings') {
    const { data: c } = await admin.from('competitions').select('name,season').eq('id', ref).maybeSingle();
    const { data: rows } = await admin.from('standings_rows').select('position,team_name,played,won,drawn,lost,goal_diff,points,is_own_team').eq('competition_id', ref).order('position').limit(40);
    if (!rows?.length) throw new Error('That table has no rows yet');
    const own = rows.find((r: any) => r.is_own_team); const top = rows.slice(0, 3);
    const facts = [`Competition: ${c?.name}${c?.season ? ' ' + c.season : ''}`, ...top.map((r: any) => `${r.position}. ${r.team_name}: ${r.points} pts from ${r.played}`), ...(own ? [`${team}: position ${own.position}, ${own.points} pts, W${own.won} D${own.drawn} L${own.lost}, goal difference ${own.goal_diff}`] : [])];
    return { category: 'League', facts, fallback: { title: own ? `${team} sit ${ord(own.position)} in the ${c?.name}` : `${c?.name} update`, summary: `Where ${team} stand in the ${c?.name}.`, body: facts.join('\n'), category: 'League' } };
  }
  if (kind === 'tryout') {
    const { data: t } = await admin.from('tryouts').select('*').eq('id', ref).maybeSingle(); if (!t) throw new Error('Tryout not found');
    const facts = [`Tryout: ${t.title}`, `Date: ${fmtDay(t.starts_at)} at ${fmtTime(t.starts_at)}`, t.location ? `Location: ${t.location}` : '', t.age_group ? `Age group: ${t.age_group}` : '', t.capacity ? `Places: ${t.capacity}` : '', t.apply_by ? `Apply by: ${fmtDay(t.apply_by)}` : '', t.description ? `Details: ${clip(t.description, 800)}` : '', 'How to apply: through the Tryouts section of the club app/website'].filter(Boolean);
    return { category: 'Tryouts', facts, fallback: { title: `${t.title}: apply now`, summary: `${team} invite players to ${t.title} on ${fmtDay(t.starts_at)}.`, body: facts.join('\n'), category: 'Tryouts' } };
  }
  if (kind === 'product') {
    const { data: p } = await admin.from('products').select('*, product_categories(name), product_variants(color_name,size_label,stock,is_active)').eq('id', ref).maybeSingle(); if (!p) throw new Error('Product not found');
    const vs = (p.product_variants ?? []).filter((v: any) => v.is_active);
    const colors = [...new Set(vs.map((v: any) => v.color_name).filter(Boolean))]; const sizes = [...new Set(vs.map((v: any) => v.size_label).filter(Boolean))];
    const { data: cur } = await admin.from('site_settings').select('value').eq('key', 'currency').maybeSingle();
    const facts = [`New in the club shop: ${p.name}`, `Price: ${typeof cur?.value === 'string' ? cur.value : ''} ${p.price}`, p.product_categories?.name ? `Category: ${p.product_categories.name}` : '', p.description ? `Description: ${clip(p.description, 500)}` : '', colors.length ? `Colours: ${colors.join(', ')}` : '', sizes.length ? `Sizes: ${sizes.join(', ')}` : '', 'Stock is limited to what is listed in the shop'].filter(Boolean);
    return { category: 'Shop', facts, fallback: { title: `New in the shop: ${p.name}`, summary: `${p.name} is now available in the ${team} shop.`, body: facts.join('\n'), category: 'Shop' } };
  }
  if (kind === 'custom') {
    const t = clip(topic, 800); if (t.trim().length < 5) throw new Error('Describe the topic first');
    return { category: 'Club news', facts: [`Topic from the editor: ${t}`], fallback: { title: clip(t, 70), summary: clip(t, 190), body: t, category: 'Club news' } };
  }
  throw new Error('Unknown story type');
}

Deno.serve(withLang(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const caller = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: ok } = await caller.rpc('has_permission', { perm: 'news.manage' });
  if (!ok) return json({ error: 'Forbidden' }, 403);
  const body = await req.json().catch(() => ({}));
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    const tone = ['professional', 'enthusiastic', 'friendly'].includes(body.tone) ? body.tone : 'professional';
    const length = ['short', 'medium', 'long'].includes(body.length) ? body.length : 'medium';
    const team = await teamName(admin);
    if (body.mode === 'sources') return json(await sources(admin));
    if (body.mode === 'generate') {
      const g = await gather(admin, String(body.kind), body.ref_id ? String(body.ref_id) : null, team, String(body.topic ?? ''));
      const ai = await ask2(team, tone, length, g.category, g.facts, clip(body.notes, 500));
      const d = ai && ai.title && ai.body ? ai : null;
      return json({ title: clip(d?.title ?? g.fallback.title, 120), summary: clip(d?.summary ?? g.fallback.summary, 220), body: clip(d?.body ?? g.fallback.body, 6000), category: clip(d?.category ?? g.category, 40), ai: !!d });
    }
    if (body.mode === 'polish') {
      const ai = await ask(SYSTEM(team, tone), `Improve the wording of this news story. Keep every fact exactly as written; do not add new facts, names or numbers.\nTITLE: ${clip(body.title, 200)}\nSTORY:\n${clip(body.body, 6000)}\nReply as JSON: {"title":"...","summary":"one sentence under 200 characters","body":"paragraphs separated by a blank line"}`);
      return json(ai?.body ? { title: clip(ai.title, 120), summary: clip(ai.summary, 220), body: clip(ai.body, 6000), ai: true } : { ai: false });
    }
    return json({ error: 'Unknown mode' }, 400);
  } catch (e) { return json({ error: String((e as Error).message ?? e) }, 500); }
}));
