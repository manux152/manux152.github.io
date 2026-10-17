import { useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// Cookie consent. "Strictly necessary" is always on; the other three need a choice from the person.
// Until a choice exists (or while this file is still loading it) everything optional counts as OFF.
export type Category = 'preferences' | 'analytics' | 'marketing';
export type Choice = Record<Category, boolean>;
export type ConsentAction = 'accept_all' | 'reject_non_essential' | 'custom';
type Stored = Choice & { at: string };

const KEY = 'consent:v1'; const DEVICE = 'device_id:v1'; const SEEN = 'consent:seen:v1'; const DAY = 864e5;
let state: Stored | null = null; let loaded = false; let decidedThisVisit = false; let chosenThisVisit = false; let panelOpen = false;
// "Remember this device": the choice is kept on the device and only asked again after it has not been used for `reaskDays` (set in Admin; 0 = every visit).
let reaskDays = 3; let lastSeen = 0; let idle = 0;
/** True when a saved choice has gone stale (device unused too long) and no new choice was made yet: optional cookies count as OFF until then. */
const lapsed = () => !!state && !chosenThisVisit && (reaskDays <= 0 || idle > reaskDays * DAY);
export function setReaskDays(n: number) { const v = Number.isFinite(n) ? Math.max(0, Math.min(365, Math.round(n))) : 3; if (v !== reaskDays) { reaskDays = v; emit(); } }
function visit() {          // called when the app opens and whenever it comes back to the front
  const now = Date.now(); idle = lastSeen ? now - lastSeen : 0; lastSeen = now;
  if (state && reaskDays > 0 && idle > reaskDays * DAY) { chosenThisVisit = false; decidedThisVisit = false; }   // away too long (even in a tab left open): ask again
  AsyncStorage.setItem(SEEN, String(now)).catch(() => {}); emit();
}
const subs = new Set<() => void>(); const emit = () => subs.forEach((f) => f());

const rand = () => { const c = (globalThis as any).crypto; if (c?.randomUUID) return c.randomUUID() as string; return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('-'); };
let deviceId: string | null = null;
/** A random code that stands in for this device on evidence records. It is not linked to anything else. */
export async function getDeviceId(): Promise<string> {
  if (deviceId) return deviceId;
  let id: string | null = null;
  try { id = await AsyncStorage.getItem(DEVICE); } catch { id = null; }
  if (!id || id.length < 8) { id = rand(); try { await AsyncStorage.setItem(DEVICE, id); } catch { /* still works for this visit */ } }
  deviceId = id; return id;
}
/** Device details that go on evidence records. */
export function deviceInfo() {
  const web = Platform.OS === 'web'; const g: any = globalThis;
  let locale = 'en'; try { locale = Intl.DateTimeFormat().resolvedOptions().locale; } catch { /* keep default */ }
  return { platform: Platform.OS, ua: web ? String(g.navigator?.userAgent ?? '').slice(0, 300) : `${Platform.OS} ${Platform.Version}`, locale };
}
/** Search-engine crawlers are not asked to accept anything, so the public pages stay indexable. */
export const isCrawler = () => Platform.OS === 'web' && /bot|crawl|spider|slurp|bingpreview|lighthouse|facebookexternalhit|whatsapp|telegram/i.test(String((globalThis as any).navigator?.userAgent ?? ''));

export const hasConsent = (c: Category) => !!state?.[c] && !lapsed();

export async function loadConsent() {
  try { const s = await AsyncStorage.getItem(KEY); if (s) { const p = JSON.parse(s); state = { preferences: !!p.preferences, analytics: !!p.analytics, marketing: !!p.marketing, at: String(p.at ?? '') }; } } catch { state = null; }
  try { const t = Number(await AsyncStorage.getItem(SEEN)); lastSeen = Number.isFinite(t) && t > 0 ? t : state?.at ? Date.parse(state.at) || 0 : 0; } catch { lastSeen = 0; }
  loaded = true; visit();
}
void loadConsent();
AppState.addEventListener('change', (st) => { if (st === 'active') visit(); });
setInterval(() => { if (AppState.currentState === 'active') { lastSeen = Date.now(); AsyncStorage.setItem(SEEN, String(lastSeen)).catch(() => {}); } }, 5 * 60 * 1000);   // an open app counts as "in use"

async function clearPreferenceStorage() {
  try { const keys = (await AsyncStorage.getAllKeys()).filter((k) => k === 'lang' || k === 'prefs.v1' || k.startsWith('tr:v1:')); if (keys.length) await AsyncStorage.multiRemove(keys); } catch { /* ignore */ }
}

/** Saves the choice on this device and writes it to the evidence log. */
export async function saveConsent(choice: Choice, action: ConsentAction) {
  state = { ...choice, at: new Date().toISOString() }; decidedThisVisit = true; chosenThisVisit = true; idle = 0; lastSeen = Date.now(); panelOpen = false; emit();
  AsyncStorage.setItem(SEEN, String(lastSeen)).catch(() => {});
  try { await AsyncStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  if (!choice.preferences) clearPreferenceStorage();
  const d = deviceInfo();
  supabase.rpc('consent_log', { p_device: await getDeviceId(), p_action: action, p_preferences: choice.preferences, p_analytics: choice.analytics, p_marketing: choice.marketing, p_platform: d.platform, p_ua: d.ua, p_locale: d.locale }).then(() => {}, () => {});
}
export const acceptAll = () => saveConsent({ preferences: true, analytics: true, marketing: true }, 'accept_all');
export const rejectOptional = () => saveConsent({ preferences: false, analytics: false, marketing: false }, 'reject_non_essential');

/** Re-opens the cookie choices (used by the footer and Settings). */
export function openCookieSettings() { panelOpen = true; emit(); }
export function closeCookieSettings() { panelOpen = false; decidedThisVisit = true; emit(); }

export function useConsent() {
  const [, set] = useState(0);
  useEffect(() => { const f = () => set((n) => n + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  return { loaded, saved: state, decidedThisVisit, panelOpen, lapsed: lapsed() };
}
