import { supabase } from './supabase';

export type AdPlacement = 'home' | 'news' | 'match' | 'shop' | 'footer';
export type Ad = { id: string; headline: string | null; body: string | null; image_url: string | null; link_url: string | null; cta_label: string | null; advertiser: string | null; weight: number };

const seen = new Set<string>();      // count each ad + place once per visit, so refreshing does not inflate views
export function trackAd(id: string, placement: AdPlacement, kind: 'view' | 'click') {
  const key = `${id}:${placement}:${kind}`;
  if (kind === 'view') { if (seen.has(key)) return; seen.add(key); }
  supabase.rpc('ad_track', { p_ad: id, p_placement: placement, p_kind: kind }).then(() => {}, () => {});
}

/** Picks one ad, favouring higher "weight" (1–10). */
export function pickAd(list: Ad[]): Ad | null {
  if (!list.length) return null;
  const total = list.reduce((s, a) => s + Math.max(1, a.weight || 1), 0);
  let r = Math.random() * total;
  for (const a of list) { r -= Math.max(1, a.weight || 1); if (r <= 0) return a; }
  return list[0];
}
