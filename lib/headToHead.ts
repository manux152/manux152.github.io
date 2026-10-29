import { useMemo } from 'react';
import { useTable } from './useQuery';

export type Result = 'W' | 'D' | 'L';
export type Meeting = { id: string; kickoff_at: string; competition: string | null; is_home: boolean; gf: number; ga: number; res: Result };
export type H2H = { opponent_id: string; name: string; logo_url: string | null; played: number; won: number; drawn: number; lost: number; gf: number; ga: number; meetings: Meeting[] };

export const resultOf = (gf: number, ga: number): Result => (gf > ga ? 'W' : gf < ga ? 'L' : 'D');
/** Points per game (3 for a win, 1 for a draw). Used to rank "best record" and "toughest opponent". */
export const ppg = (h: H2H) => (h.played ? (h.won * 3 + h.drawn) / h.played : 0);

/** Turns finished matches into one record per opponent. Meetings are newest first. Matches without a score are skipped. */
export function buildHeadToHead(rows: any[]): H2H[] {
  const by = new Map<string, H2H>();
  for (const r of rows) {
    if (!r?.opponent_id || r.goals_for == null || r.goals_against == null) continue;
    const gf = Number(r.goals_for), ga = Number(r.goals_against);
    let h = by.get(r.opponent_id);
    if (!h) {
      h = { opponent_id: r.opponent_id, name: r.opponents?.name ?? 'Unknown', logo_url: r.opponents?.logo_url ?? null, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, meetings: [] };
      by.set(r.opponent_id, h);
    }
    const res = resultOf(gf, ga);
    h.played++; h.gf += gf; h.ga += ga;
    if (res === 'W') h.won++; else if (res === 'D') h.drawn++; else h.lost++;
    h.meetings.push({ id: r.id, kickoff_at: r.kickoff_at, competition: r.competition ?? null, is_home: !!r.is_home, gf, ga, res });
  }
  const out = [...by.values()];
  out.forEach((h) => h.meetings.sort((a, b) => String(b.kickoff_at).localeCompare(String(a.kickoff_at))));
  return out.sort((a, b) => b.played - a.played || a.name.localeCompare(b.name));
}

/** Every finished match with a score, grouped by opponent. Match results are public, so this works for visitors too. */
export function useHeadToHead() {
  const q = useTable('matches', (m) => m.select('id, opponent_id, kickoff_at, competition, is_home, goals_for, goals_against, opponents(name, logo_url)').eq('status', 'finished').order('kickoff_at', { ascending: false }), []);
  const rows = useMemo(() => buildHeadToHead(q.data as any[]), [q.data]);
  return { rows, loading: q.loading, error: q.error };
}
