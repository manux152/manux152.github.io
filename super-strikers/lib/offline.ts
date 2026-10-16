import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Saves the last good copy of PUBLIC information (fixtures, results, news, squad, shop…) on the device, so the app still shows something with no signal.
// Only the tables below are ever saved. Private information (orders, fees, forms, injuries, messages, profiles…) is never written to the device by this feature.
const PUBLIC_TABLES = new Set(['matches', 'opponents', 'competitions', 'standings_rows', 'seasons', 'news_posts', 'announcements', 'players', 'positions', 'staff_members', 'coaches', 'albums', 'media_items', 'events', 'event_types', 'match_events', 'match_players', 'lineups', 'lineup_players', 'formations', 'pages', 'products', 'product_images', 'product_categories', 'awards', 'award_types', 'tryouts', 'training_sessions', 'polls', 'poll_options', 'match_videos', 'video_clips']);
const PREFIX = 'oc1:'; const INDEX = 'oc1:index'; const MAX_ENTRIES = 60; const MAX_BYTES = 300_000; const MAX_AGE_MS = 14 * 24 * 3600e3;

let offline = false; const subs = new Set<(v: boolean) => void>();
const setOffline = (v: boolean) => { if (v !== offline) { offline = v; subs.forEach((f) => f(v)); } };
/** True while the app is showing saved information because it could not reach the server. */
export function useOffline() {
  const [v, setV] = useState(offline);
  useEffect(() => {
    subs.add(setV);
    let off: (() => void) | undefined;
    if (Platform.OS === 'web') {
      const g: any = globalThis; const up = () => setOffline(false); const down = () => setOffline(true);
      g.addEventListener?.('online', up); g.addEventListener?.('offline', down); if (g.navigator && g.navigator.onLine === false) setOffline(true);
      off = () => { g.removeEventListener?.('online', up); g.removeEventListener?.('offline', down); };
    }
    return () => { subs.delete(setV); off?.(); };
  }, []);
  return v;
}
export const markOnline = () => setOffline(false);
export const markOffline = () => setOffline(true);

export const cacheable = (table: string) => PUBLIC_TABLES.has(table);
const keyOf = (href: string) => PREFIX + href;

export async function cacheWrite(href: string, rows: unknown[]) {
  try {
    const body = JSON.stringify({ at: Date.now(), rows });
    if (body.length > MAX_BYTES) return;
    const k = keyOf(href); await AsyncStorage.setItem(k, body);
    const idx: string[] = JSON.parse((await AsyncStorage.getItem(INDEX)) ?? '[]').filter((x: string) => x !== k); idx.push(k);
    while (idx.length > MAX_ENTRIES) { const old = idx.shift()!; await AsyncStorage.removeItem(old); }
    await AsyncStorage.setItem(INDEX, JSON.stringify(idx));
  } catch { /* storage full or unavailable: carry on without a cache */ }
}
export async function cacheRead(href: string): Promise<unknown[] | null> {
  try {
    const raw = await AsyncStorage.getItem(keyOf(href)); if (!raw) return null;
    const { at, rows } = JSON.parse(raw); if (!Array.isArray(rows) || Date.now() - at > MAX_AGE_MS) return null; return rows;
  } catch { return null; }
}
/** Called when someone signs out, so nothing saved stays behind on a shared device. */
export async function clearOfflineCache() {
  try { const idx: string[] = JSON.parse((await AsyncStorage.getItem(INDEX)) ?? '[]'); await AsyncStorage.multiRemove([...idx, INDEX]); } catch { /* ignore */ }
}
// Network failures come back as errors with no HTTP status; real database errors (permissions, bad query) must not be hidden by old data.
export const looksOffline = (err: any) => !!err && (/failed to fetch|network request failed|networkerror|load failed|fetch failed|timeout/i.test(String(err.message ?? err)) || (err.code === '' && !err.details && !err.hint && !err.status));
