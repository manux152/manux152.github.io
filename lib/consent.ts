import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

// Cookie consent. "Strictly necessary" is always on; the other three need a choice from the person.
// Until a choice exists (or while this file is still loading it) everything optional counts as OFF.
export type Category = 'preferences' | 'analytics' | 'marketing';
export type Choice = Record<Category, boolean>;
export type ConsentAction = 'accept_all' | 'reject_non_essential' | 'custom';
type Stored = Choice & { at: string };

const KEY = 'consent:v1'; const DEVICE = 'device_id:v1';
let state: Stored | null = null; let loaded = false; let decidedThisVisit = false; let panelOpen = false;
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

export const hasConsent = (c: Category) => !!state?.[c];

export async function loadConsent() {
  try { const s = await AsyncStorage.getItem(KEY); if (s) { const p = JSON.parse(s); state = { preferences: !!p.preferences, analytics: !!p.analytics, marketing: !!p.marketing, at: String(p.at ?? '') }; } } catch { state = null; }
  loaded = true; emit();
}
void loadConsent();

async function clearPreferenceStorage() {
  try { const keys = (await AsyncStorage.getAllKeys()).filter((k) => k === 'lang' || k === 'prefs.v1' || k.startsWith('tr:v1:')); if (keys.length) await AsyncStorage.multiRemove(keys); } catch { /* ignore */ }
}

/** Saves the choice on this device and writes it to the evidence log. */
export async function saveConsent(choice: Choice, action: ConsentAction) {
  state = { ...choice, at: new Date().toISOString() }; decidedThisVisit = true; panelOpen = false; emit();
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
  return { loaded, saved: state, decidedThisVisit, panelOpen };
}
