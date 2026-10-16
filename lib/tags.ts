import { supabase } from './supabase';

export type Person = { kind: 'player' | 'member'; id: string; name: string; photo?: string | null };
export type Appearance = { kind: 'news' | 'media'; item_id: string; title: string; sub: string | null; image_url: string | null; url: string | null; slug: string | null; album_id: string | null; media_kind: string | null; created_at: string | null };

export const personHref = (p: Person) => (p.kind === 'player' ? `/player/${p.id}` : `/tagged/member/${p.id}?name=${encodeURIComponent(p.name)}${p.photo ? '&photo=' + encodeURIComponent(p.photo) : ''}`);

/** People tagged on published photos/videos or news articles (public-safe: uses a database function). */
export async function fetchTagPeople(type: 'media' | 'news', ids: string[]): Promise<Record<string, Person[]>> {
  const out: Record<string, Person[]> = {}; if (!ids.length) return out;
  for (let i = 0; i < ids.length; i += 150) {
    const { data } = await supabase.rpc('content_tag_people', { p_type: type, p_ids: ids.slice(i, i + 150) });
    (data ?? []).forEach((r: any) => { (out[r.target_id] ||= []).push({ kind: r.kind, id: r.person_id, name: r.name, photo: r.photo_url }); });
  }
  return out;
}

/** Editor view: every tag on one item, including members who hide from search. Staff only. */
export async function fetchTagsForEditor(type: 'media' | 'news', id: string): Promise<Person[]> {
  const { data } = await supabase.from('content_tags').select('player_id,profile_id,players(full_name,photo_url),profiles(full_name,avatar_url)').eq('target_type', type).eq('target_id', id);
  return (data ?? []).map((r: any) => r.player_id
    ? { kind: 'player' as const, id: r.player_id, name: r.players?.full_name ?? 'Player', photo: r.players?.photo_url }
    : { kind: 'member' as const, id: r.profile_id, name: r.profiles?.full_name ?? 'Member', photo: r.profiles?.avatar_url });
}

/** Makes the stored tags match `people` (adds the new ones, removes the others). */
export async function saveTags(type: 'media' | 'news', id: string, people: Person[], userId?: string | null) {
  const have = await fetchTagsForEditor(type, id); const key = (p: Person) => `${p.kind}:${p.id}`;
  const want = new Set(people.map(key)); const had = new Set(have.map(key));
  for (const p of have) if (!want.has(key(p))) {
    const q = supabase.from('content_tags').delete().eq('target_type', type).eq('target_id', id);
    const { error } = await (p.kind === 'player' ? q.eq('player_id', p.id) : q.eq('profile_id', p.id)); if (error) throw new Error(error.message);
  }
  const rows = people.filter((p) => !had.has(key(p))).map((p) => ({ target_type: type, target_id: id, tagged_by: userId ?? null, ...(p.kind === 'player' ? { player_id: p.id } : { profile_id: p.id }) }));
  if (rows.length) { const { error } = await supabase.from('content_tags').insert(rows); if (error) throw new Error(error.message); }
}

export async function fetchAppearances(playerId?: string | null, profileId?: string | null): Promise<Appearance[]> {
  const { data } = await supabase.rpc('person_appearances', { p_player: playerId ?? null, p_profile: profileId ?? null });
  return (data ?? []) as Appearance[];
}

/** Picture for a video link: YouTube thumbnails; other videos have none. */
export function videoThumb(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/i);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
}
