import { useEffect } from 'react';
import { Platform } from 'react-native';
import { usePathname } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { useApp } from './app-context';
import { hasConsent } from './consent';

// Anonymous page counts for Admin → Analytics. Only the page name is sent (never links with ids, names or search words),
// plus a random code made when the app opens. No IP address, account or device details are stored.
const rand = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
const visitor = rand();
let optedOut: boolean | undefined;

export async function isOptedOut(): Promise<boolean> {
  if (optedOut !== undefined) return optedOut;
  let v = false;
  try { v = (await AsyncStorage.getItem('analytics_optout')) === '1'; } catch { v = false; }
  if (Platform.OS === 'web' && (globalThis as any).navigator?.doNotTrack === '1') v = true;     // respect "Do Not Track"
  optedOut = v; return v;
}
export async function setOptedOut(v: boolean) { optedOut = v; try { await AsyncStorage.setItem('analytics_optout', v ? '1' : '0'); } catch { /* ignore */ } }

// Pages that are personal or staff-only are never counted
const SKIP = /^\/(admin|login|reset-password|pay-return|account|profile|orders|chat|family|development|invite|dashboard|settings|cart)(\/|$)/;
const DYNAMIC = /^\/(news|player|match|product|page|media|tryout|tagged|album)\/[^/]+/;
export function normalizePath(raw: string): string | null {
  const p = (raw || '/').split(/[?#]/)[0].replace(/\/+$/, '') || '/';
  if (SKIP.test(p)) return null;
  return p.replace(DYNAMIC, (_m, a) => `/${a}/:id`).slice(0, 80);
}

export async function trackPage(path: string) {
  const p = normalizePath(path); if (!p || !hasConsent('analytics') || (await isOptedOut())) return;
  supabase.rpc('analytics_hit', { p_path: p, p_visitor: visitor }).then(() => {}, () => {});
}

/** Counts a page view each time the screen changes. */
export function usePageViews() {
  const pathname = usePathname(); const { settings } = useApp();
  useEffect(() => { if (settings.analytics_enabled === false) return; trackPage(pathname); }, [pathname, settings.analytics_enabled]);
}
