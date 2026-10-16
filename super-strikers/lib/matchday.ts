import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from './supabase';
import { onPullRefresh } from './refresh';

export type Period = 'not_started' | 'first_half' | 'half_time' | 'second_half' | 'full_time';
export type Commentary = { id: string; match_id: string; minute: number | null; kind: string; body: string; created_at: string };

/** The minute to show on the clock, worked out from the start of the current period. Ticks without any network traffic. */
export function clockMinute(m: { period?: Period; period_started_at?: string | null; period_base_minute?: number | null }, now = Date.now()): string {
  if (!m.period || m.period === 'not_started') return '';
  if (m.period === 'half_time') return 'HT';
  if (m.period === 'full_time') return 'FT';
  const start = m.period_started_at ? new Date(m.period_started_at).getTime() : now;
  const base = m.period_base_minute ?? 0;
  const mins = Math.max(0, Math.floor((now - start) / 60000)) + base;
  const cap = base + 45;                         // after 45 / 90 show added time as 45+3′
  return mins >= cap ? `${cap}+${mins - cap + 1}′` : `${mins + 1}′`;
}

/** Running timer with seconds: 23:41, and during added time 45:00 +1:23. HT / FT when the clock is stopped. */
export function clockDisplay(m: { period?: Period; period_started_at?: string | null; period_base_minute?: number | null }, now = Date.now()): string {
  if (!m.period || m.period === 'not_started') return '';
  if (m.period === 'half_time') return 'HT';
  if (m.period === 'full_time') return 'FT';
  const start = m.period_started_at ? new Date(m.period_started_at).getTime() : now;
  const base = m.period_base_minute ?? 0;
  const secs = Math.max(0, Math.floor((now - start) / 1000));
  const mm = (n: number) => String(n).padStart(2, '0');
  if (secs < 45 * 60) return `${mm(base + Math.floor(secs / 60))}:${mm(secs % 60)}`;
  const extra = secs - 45 * 60;
  return `${base + 45}:00 +${Math.floor(extra / 60)}:${mm(extra % 60)}`;
}

/** When the clock should next move on its own (ms since epoch), or null if it is stopped / switched off. */
export function nextAutoBoundary(m: any, htMinutes = 15): number | null {
  if (!m || m.auto_clock === false) return null;
  const at = (iso: string | null | undefined, mins: number) => (iso ? new Date(iso).getTime() + mins * 60000 : null);
  if (m.status === 'scheduled' && (!m.period || m.period === 'not_started')) return m.kickoff_at ? new Date(m.kickoff_at).getTime() : null;
  if (m.status !== 'live') return null;
  if (m.period === 'first_half') return at(m.period_started_at, 45 + (m.first_half_added ?? 0));
  if (m.period === 'half_time') return at(m.period_started_at, htMinutes);
  if (m.period === 'second_half') return at(m.period_started_at, 45 + (m.second_half_added ?? 0));
  return null;
}

/** Asks the server to move the clock on (safe for anyone to call: it only follows the time). */
export async function autoTick(): Promise<void> { try { await supabase.rpc('matches_auto_tick'); } catch { /* the server clock (pg_cron) will catch up */ } }

/**
 * Keeps a match's automatic clock moving: waits for the next kick-off / half-time / full-time moment, nudges the server,
 * then reloads. Works for anyone who has the match open, so it also covers servers without pg_cron.
 */
export function useAutoClock(match: any, refresh: () => void | Promise<void>, htMinutes = 15) {
  const key = match ? `${match.status}|${match.period}|${match.period_started_at}|${match.first_half_added}|${match.second_half_added}|${match.auto_clock}|${match.kickoff_at}` : '';
  useEffect(() => {
    if (!match) return;
    const b = nextAutoBoundary(match, htMinutes); if (b == null) return;
    const wait = Math.min(Math.max(b - Date.now() + 1500, 500), 2147483000);
    const t = setTimeout(async () => { await autoTick(); await refresh(); }, wait);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, htMinutes]);
}

/** The current time, refreshed every `ms` while `active`. */
export function useNow(active = true, ms = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!active) return; setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [active, ms]);
  return now;
}

/** mm:ss until a time (00:00 once passed). */
export function countdownText(targetIso: string, now = Date.now()): string {
  const s = Math.max(0, Math.ceil((new Date(targetIso).getTime() - now) / 1000));
  const h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60), se = s % 60, p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(mi)}:${p(se)}` : `${p(mi)}:${p(se)}`;
}

/** Re-renders every 15 seconds so the clock moves. */
export function useTick(active: boolean, ms = 15000) {
  const [, set] = useState(0);
  useEffect(() => { if (!active) return; const t = setInterval(() => set((n) => n + 1), ms); return () => clearInterval(t); }, [active, ms]);
}

/**
 * Loads a match with its events and commentary and keeps them fresh: instantly through Realtime,
 * and every 30 seconds as a safety net (Realtime can be switched off or blocked on some networks).
 */
export function useLiveMatch(matchId: string | undefined, live: boolean) {
  const [match, setMatch] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [commentary, setCommentary] = useState<Commentary[]>([]);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  const load = useCallback(async () => {
    if (!matchId) return;
    const [m, e, c] = await Promise.all([
      supabase.from('matches').select('*, opponents(name)').eq('id', matchId).maybeSingle(),
      supabase.from('match_events').select('*, event_types(label,stat_key), player:players!match_events_player_id_fkey(full_name), assist:players!match_events_related_player_id_fkey(full_name)').eq('match_id', matchId).order('minute', { ascending: true }),
      supabase.from('match_commentary').select('*').eq('match_id', matchId).order('created_at', { ascending: false }).limit(100),
    ]);
    if (!alive.current) return;
    setMatch(m.data ?? null); setEvents(e.data ?? []); setCommentary((c.data ?? []) as Commentary[]); setLoading(false);
  }, [matchId]);

  useEffect(() => { alive.current = true; load(); return () => { alive.current = false; }; }, [load]);
  useEffect(() => onPullRefresh(load), [load]);

  const done = match?.status === 'finished' || match?.status === 'cancelled';
  useEffect(() => {
    if (!matchId || !live || done) return;
    const ch = supabase.channel(`live-${matchId}-${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` }, load)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_commentary', filter: `match_id=eq.${matchId}` }, load)
      .subscribe();
    const poll = setInterval(load, 30000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  }, [matchId, live, done, load]);

  return { match, events, commentary, loading, refresh: load };
}

/** Icon for a match event (goal, cards, substitution) from its type. */
export const eventIcon = (e: { event_types?: { stat_key?: string | null; label?: string | null } | null }) => {
  const k = e.event_types?.stat_key; const l = (e.event_types?.label ?? '').toLowerCase();
  return k === 'goal' ? '⚽' : k === 'goal_against' ? '🥅' : k === 'yellow_card' ? '🟨' : k === 'red_card' ? '🟥' : l.startsWith('sub') ? '🔁' : '•';
};

export const KIND_ICON: Record<string, string> = { goal: '⚽', card: '🟥', kickoff: '🟢', half_time: '⏸️', second_half: '▶️', full_time: '🏁', sub: '🔁', chance: '❗', comment: '💬', added_time: '⏱️' };

// ───────── Man of the Match ─────────
export async function motmTally(matchId: string): Promise<Record<string, number>> {
  const { data } = await supabase.rpc('motm_tally', { p_match: matchId });
  return Object.fromEntries(((data ?? []) as { player_id: string; votes: number }[]).map((r) => [r.player_id, Number(r.votes)]));
}
export async function myMotmVote(matchId: string, me: string): Promise<string | null> {
  const { data } = await supabase.from('motm_votes').select('player_id').eq('match_id', matchId).eq('voter_id', me).maybeSingle();
  return (data as any)?.player_id ?? null;
}
export async function castMotmVote(matchId: string, me: string, playerId: string) {
  const { error } = await supabase.from('motm_votes').upsert({ match_id: matchId, voter_id: me, player_id: playerId }, { onConflict: 'match_id,voter_id' });
  if (error) throw new Error(/row-level security|violates/i.test(error.message) ? 'Voting is closed for this match, or that player did not play.' : error.message);
}

/** The match minute as a number (for saving events). Added time counts on past 45 / 90 (e.g. 47 or 93), up to the announced added time. */
export function currentMinute(m: { period?: Period; period_started_at?: string | null; period_base_minute?: number | null; first_half_added?: number | null; second_half_added?: number | null }, now = Date.now()): number | null {
  if (m.period !== 'first_half' && m.period !== 'second_half') return null;
  const start = m.period_started_at ? new Date(m.period_started_at).getTime() : now;
  const base = m.period_base_minute ?? 0;
  const added = (m.period === 'first_half' ? m.first_half_added : m.second_half_added) ?? 0;
  return Math.min(base + 45 + added, Math.max(0, Math.floor((now - start) / 60000)) + base + 1);
}

/** Both team names in playing order: the home side first. Works for home and away matches. */
export function matchNames(m: { is_home?: boolean | null; opponents?: { name?: string | null } | null }, team?: unknown) {
  const us = typeof team === 'string' && team.trim() ? team.trim() : 'Super Strikers';
  const them = m?.opponents?.name || 'Opponent';
  return m?.is_home === false ? { home: them, away: us, us, them, usHome: false } : { home: us, away: them, us, them, usHome: true };
}
/** "Super Strikers vs HomeBoys" (home side first). */
export const matchTitle = (m: any, team?: unknown) => { const n = matchNames(m, team); return `${n.home} vs ${n.away}`; };
/** Score in playing order: "Super Strikers 2 – 1 HomeBoys". */
export function matchScoreLine(m: any, team?: unknown) {
  const n = matchNames(m, team); const f = m.goals_for ?? 0, a = m.goals_against ?? 0;
  return n.usHome ? `${n.home} ${f} – ${a} ${n.away}` : `${n.home} ${a} – ${f} ${n.away}`;
}

export type MatchPhase = 'scheduled' | 'live' | 'ht' | 'ft' | 'cancelled' | 'postponed';
/** One word for where a match is: waiting, being played, half time, finished, called off. */
export const matchPhase = (m: any): MatchPhase =>
  m.status === 'live' ? (m.period === 'half_time' ? 'ht' : 'live') : m.status === 'finished' ? 'ft' : m.status === 'cancelled' ? 'cancelled' : m.status === 'postponed' ? 'postponed' : 'scheduled';

/** "2d 3h", "5h 10m", then a mm:ss countdown inside the last hour. */
export function untilText(iso: string, now = Date.now()): string {
  const ms = new Date(iso).getTime() - now; if (ms <= 0) return 'Starting…';
  if (ms < 3600e3) return countdownText(iso, now);
  const mins = Math.floor(ms / 60000), h = Math.floor(mins / 60), d = Math.floor(h / 24);
  return d >= 1 ? `${d}d ${h % 24}h` : `${h}h ${mins % 60}m`;
}
/** When the second half starts (ISO), during half time. */
export const secondHalfAt = (m: any, htMinutes = 15) => new Date(new Date(m.period_started_at ?? Date.now()).getTime() + htMinutes * 60000).toISOString();
