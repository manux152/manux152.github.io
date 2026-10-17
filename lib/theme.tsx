import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Platform, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { hasConsent } from './consent';

export type Mode = 'system' | 'light' | 'dark';
export type Prefs = { mode: Mode; textScale: number; highContrast: boolean; reduceMotion: boolean; underlineLinks: boolean; navTheme: string; navBg: string };
export const DEFAULT_PREFS: Prefs = { mode: 'system', textScale: 1, highContrast: false, reduceMotion: false, underlineLinks: false, navTheme: 'site', navBg: 'site' };
export const TEXT_SIZES: { value: string; label: string; scale: number }[] = [
  { value: '1', label: 'Normal', scale: 1 }, { value: '1.15', label: 'Large', scale: 1.15 },
  { value: '1.3', label: 'Larger', scale: 1.3 }, { value: '1.5', label: 'Largest', scale: 1.5 },
];

export type Palette = {
  bg: string; card: string; border: string; text: string; heading: string; muted: string;
  inputBg: string; inputBorder: string; placeholder: string; danger: string; skeleton: string;
  footerBg: string; footerText: string; footerMuted: string; footerBorder: string; overlay: string;
};
const LIGHT: Palette = { bg: '#F6F7F9', card: '#FFFFFF', border: '#E6E8EC', text: '#222222', heading: '#111111', muted: '#5F6670', inputBg: '#FFFFFF', inputBorder: '#C9CDD3', placeholder: '#8A9099', danger: '#B3261E', skeleton: '#E6E8EC', footerBg: '#14201b', footerText: '#E3EBE6', footerMuted: '#A9B8AF', footerBorder: '#2b3a33', overlay: 'rgba(0,0,0,0.45)' };
const DARK: Palette = { bg: '#0E1311', card: '#19201D', border: '#2D3833', text: '#E6ECE8', heading: '#FFFFFF', muted: '#A7B3AC', inputBg: '#121815', inputBorder: '#44514B', placeholder: '#7F8C85', danger: '#FF8A80', skeleton: '#2D3833', footerBg: '#090D0B', footerText: '#E3EBE6', footerMuted: '#A9B8AF', footerBorder: '#222C27', overlay: 'rgba(0,0,0,0.55)' };
const HC_LIGHT: Palette = { ...LIGHT, bg: '#FFFFFF', card: '#FFFFFF', border: '#000000', text: '#000000', heading: '#000000', muted: '#262626', inputBorder: '#000000', placeholder: '#4A4A4A', danger: '#8A0000', footerBg: '#000000', footerText: '#FFFFFF', footerMuted: '#F0F0F0', footerBorder: '#FFFFFF' };
const HC_DARK: Palette = { ...DARK, bg: '#000000', card: '#000000', border: '#FFFFFF', text: '#FFFFFF', heading: '#FFFFFF', muted: '#EDEDED', inputBg: '#000000', inputBorder: '#FFFFFF', placeholder: '#CFCFCF', danger: '#FF9E96', footerBg: '#000000', footerText: '#FFFFFF', footerMuted: '#F0F0F0', footerBorder: '#FFFFFF' };

const hex = (h: string) => { const m = /^#?([0-9a-f]{6})$/i.exec((h ?? '').trim()); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export function mix(color: string, other: string, amount: number) {
  const a = hex(color), b = hex(other); if (!a || !b) return color;
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * amount).toString(16).padStart(2, '0')).join('');
}
const luminance = (c: string) => { const v = hex(c); if (!v) return 0; const f = v.map((x) => { const s = x / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }); return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2]; };
export const readableOn = (bg: string) => (luminance(bg) > 0.45 ? '#111111' : '#FFFFFF');
const ratio = (a: string, b: string) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

type Ctx = {
  prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void; reset: () => void; isDark: boolean; colors: Palette;
  fs: (n: number) => number; accentFor: (primary: string) => string;
};
const ThemeCtx = createContext<Ctx>(null as any);
export const useTheme = () => useContext(ThemeCtx);
const KEY = 'prefs.v1';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      let p = DEFAULT_PREFS;
      try { const s = await AsyncStorage.getItem(KEY); if (s) p = { ...DEFAULT_PREFS, ...JSON.parse(s) }; else { const rm = await AccessibilityInfo.isReduceMotionEnabled(); p = { ...p, reduceMotion: !!rm }; } } catch { /* use defaults */ }
      setPrefsState(p); setLoaded(true);
    })();
  }, []);

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((cur) => { const next = { ...cur, ...patch }; if (hasConsent('preferences')) AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {}); return next; });
  }, []);
  const reset = useCallback(() => setPrefs(DEFAULT_PREFS), [setPrefs]);

  const isDark = prefs.mode === 'dark' || (prefs.mode === 'system' && system === 'dark');
  const colors = useMemo(() => (prefs.highContrast ? (isDark ? HC_DARK : HC_LIGHT) : isDark ? DARK : LIGHT), [prefs.highContrast, isDark]);
  const fs = useCallback((n: number) => Math.round(n * prefs.textScale), [prefs.textScale]);
  // Brand color used as TEXT/BORDER must stay readable: lighten it on dark backgrounds until contrast is at least 4.5:1.
  const accentFor = useCallback((primary: string) => {
    if (prefs.highContrast) return isDark ? '#FFFFFF' : '#000000';
    let c = primary; const bg = colors.bg;
    for (let i = 0; i < 10 && ratio(c, bg) < 4.5; i++) c = mix(c, isDark ? '#FFFFFF' : '#000000', 0.15);
    return c;
  }, [prefs.highContrast, isDark, colors.bg]);

  // Web: match the page background, enable a clear keyboard focus ring and respect reduced motion.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const root = document.documentElement;
    root.style.colorScheme = isDark ? 'dark' : 'light'; root.style.backgroundColor = colors.bg; document.body.style.backgroundColor = colors.bg;
    let el = document.getElementById('ss-a11y') as HTMLStyleElement | null;
    if (!el) { el = document.createElement('style'); el.id = 'ss-a11y'; document.head.appendChild(el); }
    el.textContent = `*:focus-visible{outline:3px solid ${prefs.highContrast ? (isDark ? '#fff' : '#000') : '#2f7fd8'} !important;outline-offset:2px !important;}` +
      (prefs.reduceMotion ? '*{animation-duration:0.001ms !important;transition-duration:0.001ms !important;scroll-behavior:auto !important;}' : '') +
      (prefs.underlineLinks ? 'a{text-decoration:underline !important;}' : '');
  }, [isDark, colors.bg, prefs.highContrast, prefs.reduceMotion, prefs.underlineLinks]);

  const value = useMemo<Ctx>(() => ({ prefs, setPrefs, reset, isDark, colors, fs, accentFor }), [prefs, setPrefs, reset, isDark, colors, fs, accentFor]);
  if (!loaded) return null;
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}
