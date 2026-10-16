import { useEffect, useState } from 'react';
import { supabase } from './supabase';

export type Badge = { key: string; label: string; icon: string; detail: string; tier: number; is_private: boolean };
export type FormRow = { match_id: string; kickoff_at: string; opponent: string; is_home: boolean; goals_for: number | null; goals_against: number | null; started: boolean; goals: number; assists: number; yellow: number; red: number; motm: boolean };

export const INJURY_STATUS = [{ value: 'out', label: '🔴 Out' }, { value: 'limited', label: '🟠 Limited training' }, { value: 'cleared', label: '🟢 Cleared' }];
export const statusLabel = (s: string) => INJURY_STATUS.find((x) => x.value === s)?.label ?? s;
export const RATINGS = Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

export async function fetchBadges(playerId: string): Promise<Badge[]> {
  const { data } = await supabase.rpc('player_badges', { p_player: playerId });
  return (data ?? []) as Badge[];
}
export async function fetchForm(playerId: string, limit = 10): Promise<FormRow[]> {
  const { data } = await supabase.rpc('player_form', { p_player: playerId, p_limit: limit });
  return (data ?? []) as FormRow[];
}
export function useBadges(playerId?: string) {
  const [b, setB] = useState<Badge[]>([]);
  useEffect(() => { if (playerId) fetchBadges(playerId).then(setB); }, [playerId]);
  return b;
}
export function useForm(playerId?: string, limit = 10) {
  const [f, setF] = useState<FormRow[]>([]); const [loading, setLoading] = useState(true);
  useEffect(() => { if (!playerId) return; fetchForm(playerId, limit).then((r) => { setF(r); setLoading(false); }); }, [playerId, limit]);
  return { form: f, loading };
}
export const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
export const result = (r: FormRow) => (r.goals_for == null || r.goals_against == null ? '' : r.goals_for > r.goals_against ? 'W' : r.goals_for < r.goals_against ? 'L' : 'D');
