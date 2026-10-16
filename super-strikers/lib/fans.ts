import { supabase } from './supabase';

// ───────── Polls ─────────
export type Poll = { id: string; question: string; match_id: string | null; news_id: string | null; results_mode: string; closes_at: string | null; is_published: boolean; poll_options: { id: string; label: string; sort_order: number }[] };
export const pollOpen = (p: Pick<Poll, 'closes_at' | 'is_published'>) => p.is_published && (!p.closes_at || new Date(p.closes_at).getTime() > Date.now());
export async function fetchPolls(f: { match?: string; news?: string; standalone?: boolean; limit?: number }): Promise<Poll[]> {
  let q: any = supabase.from('polls').select('*, poll_options(id,label,sort_order)').eq('is_published', true).order('created_at', { ascending: false }).limit(f.limit ?? 3);
  if (f.match) q = q.eq('match_id', f.match); else if (f.news) q = q.eq('news_id', f.news); else if (f.standalone) q = q.is('match_id', null).is('news_id', null);
  const { data } = await q;
  return ((data ?? []) as Poll[]).map((p) => ({ ...p, poll_options: [...(p.poll_options ?? [])].sort((a, b) => a.sort_order - b.sort_order) }));
}
export async function pollResults(id: string): Promise<Record<string, number>> {
  const { data } = await supabase.rpc('poll_results', { p_poll: id });
  return Object.fromEntries(((data ?? []) as { option_id: string; votes: number }[]).map((r) => [r.option_id, Number(r.votes)]));
}
export async function myPollVote(id: string, me: string): Promise<string | null> {
  const { data } = await supabase.from('poll_votes').select('option_id').eq('poll_id', id).eq('voter_id', me).maybeSingle();
  return (data as any)?.option_id ?? null;
}
export async function castPollVote(id: string, me: string, option: string) {
  const { error } = await supabase.from('poll_votes').upsert({ poll_id: id, voter_id: me, option_id: option }, { onConflict: 'poll_id,voter_id' });
  if (error) throw new Error(/row-level security|violates/i.test(error.message) ? 'This poll is closed.' : error.message);
}

// ───────── Comments ─────────
export type Comment = { id: string; author_id: string | null; author_name: string; avatar_url: string | null; body: string; status: string; created_at: string; mine: boolean };
export const fetchComments = async (news: string): Promise<Comment[]> => { const { data } = await supabase.rpc('news_comments_for', { p_news: news }); return (data ?? []) as Comment[]; };
export async function postComment(news: string, body: string): Promise<'visible' | 'pending'> {
  const { data, error } = await supabase.rpc('comment_post', { p_news: news, p_body: body }); if (error) throw new Error(error.message); return data as any;
}
export const deleteComment = async (id: string) => { const { error } = await supabase.rpc('comment_delete', { p_id: id }); if (error) throw new Error(error.message); };
export const reportComment = async (id: string, reason?: string) => { const { error } = await supabase.rpc('comment_report', { p_id: id, p_reason: reason ?? null }); if (error) throw new Error(error.message); };

// ───────── Predict the score ─────────
export type Pick = { goals_for: number; goals_against: number };
export async function myPick(match: string, me: string): Promise<Pick | null> {
  const { data } = await supabase.from('fan_predictions').select('goals_for,goals_against').eq('match_id', match).eq('user_id', me).maybeSingle(); return (data as any) ?? null;
}
export async function savePick(match: string, me: string, p: Pick) {
  const { error } = await supabase.from('fan_predictions').upsert({ match_id: match, user_id: me, ...p }, { onConflict: 'match_id,user_id' });
  if (error) throw new Error(/row-level security|violates/i.test(error.message) ? 'Predictions for this match are closed.' : error.message);
}
export const pickPoints = (p: Pick, m: { goals_for: number | null; goals_against: number | null }) =>
  m.goals_for == null || m.goals_against == null ? null : p.goals_for === m.goals_for && p.goals_against === m.goals_against ? 5 : Math.sign(p.goals_for - p.goals_against) === Math.sign(m.goals_for - m.goals_against) ? 2 : 0;
export type Leader = { rank: number; user_id: string; name: string; avatar_url: string | null; points: number; exact: number; correct: number; played: number; is_me: boolean };
export const fetchLeaderboard = async (since?: string | null, limit = 50): Promise<Leader[]> => { const { data } = await supabase.rpc('prediction_leaderboard', { p_since: since ?? null, p_limit: limit }); return ((data ?? []) as any[]).map((r) => ({ ...r, rank: Number(r.rank), points: Number(r.points), exact: Number(r.exact), correct: Number(r.correct), played: Number(r.played) })); };
export const fetchPickSummary = async (match: string) => { const { data } = await supabase.rpc('fan_pick_summary', { p_match: match }); return data as any; };

// ───────── Referrals ─────────
export type MyReferrals = { enabled: boolean; code: string | null; reward_kind: string; reward_value: string; min_order: string; max_rewards: string; was_referred: boolean;
  friends: { name: string; status: string; joined: string }[]; rewards: { code: string; kind: string; value: number; min_subtotal: number; ends_at: string | null; used: boolean }[] };
export const fetchMyReferrals = async (): Promise<MyReferrals | null> => { const { data } = await supabase.rpc('my_referrals'); return (data as any) ?? null; };
export const claimReferral = async (code: string): Promise<string> => { const { data, error } = await supabase.rpc('claim_referral', { p_code: code }); if (error) throw new Error(error.message); return data as string; };
export const rewardText = (kind: string, value: number | string) => kind === 'percent' ? `${Number(value)}% off` : kind === 'free_delivery' ? 'free delivery' : `${Number(value)} off`;
