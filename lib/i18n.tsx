import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useApp } from './app-context';
import { supabase } from './supabase';
import { hasConsent } from './consent';
import { DICT, LANGS, type Lang } from './i18nStrings';
import { setLangState } from './langState';

export { LANGS, type Lang };
const SUPPORTED = LANGS.map((l) => l.value) as string[];
const norm = (v: any): Lang | null => { const x = String(v ?? '').toLowerCase().slice(0, 2); return SUPPORTED.includes(x) ? (x as Lang) : null; };
const device = (): Lang | null => { try { return norm(Intl.DateTimeFormat().resolvedOptions().locale); } catch { return null; } };

// Keeps a leading emoji / symbols and trailing arrows or punctuation around a phrase: "⭐ Man of the Match", "Sign in →".
let RX: RegExp | null = null;
try { RX = new RegExp('^([^\\p{L}]*)(.*?)((?:\\s*[→:.…!?])*)$', 'u'); } catch { RX = null; }

let current: Lang = 'en';
export const currentLang = () => current;

// ───────── Automatic translation of everything the built-in dictionary does not know ─────────
// Unknown text is sent (in batches) to the translate-text Edge Function, saved on this device and in the shared
// ui_translations table, then the screen refreshes in the chosen language. Until it arrives the English text is shown.
const RT: Partial<Record<Lang, Record<string, string>>> = {};
const loaded: Partial<Record<Lang, Promise<void>>> = {};
const pending = new Map<Lang, Set<string>>();
const attempts = new Map<string, number>();
const subs = new Set<() => void>();
let timer: any = null, persistTimer: any = null, backoffUntil = 0;
const notify = () => subs.forEach((f) => f());
const eligible = (s: string) => s.length <= 1500 && /[A-Za-z]/.test(s) && !/^(https?:\/\/\S+|\S+@\S+\.\S+)$/.test(s.trim());

function loadCache(lang: Lang): Promise<void> {
  return (loaded[lang] ??= AsyncStorage.getItem('tr:v1:' + lang).then((raw) => { if (raw) RT[lang] = { ...JSON.parse(raw), ...(RT[lang] ?? {}) }; notify(); }).catch(() => {}));
}
function persist(lang: Lang) {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const m = RT[lang] ?? {}; const keys = Object.keys(m);
    const keep = keys.length > 3000 ? Object.fromEntries(keys.slice(-3000).map((k) => [k, m[k]])) : m;
    if (hasConsent('preferences')) AsyncStorage.setItem('tr:v1:' + lang, JSON.stringify(keep)).catch(() => {});
  }, 1500);
}
async function flush() {
  timer = null;
  for (const [lang, set] of [...pending]) {
    pending.delete(lang); await loadCache(lang);
    const todo = [...set].filter((x) => !RT[lang]?.[x]);
    for (let i = 0; i < todo.length;) {
      const chunk: string[] = []; let n = 0;
      while (i < todo.length && chunk.length < 30 && n + todo[i].length <= 8000) { n += todo[i].length; chunk.push(todo[i++]); }
      if (!chunk.length) { i++; continue; }
      try {
        const { data, error } = await supabase.functions.invoke('translate-text', { body: { lang, texts: chunk } });
        const tr = data?.translations;
        if (error || !tr || typeof tr !== 'object') backoffUntil = Date.now() + 60000;
        else { (RT[lang] ??= {}); Object.assign(RT[lang]!, tr); persist(lang); }
      } catch { backoffUntil = Date.now() + 60000; }
    }
  }
  notify();
}
function enqueue(lang: Lang, s: string) {
  const k = lang + '|' + s; const n = attempts.get(k) ?? 0; if (n >= 2) return;
  attempts.set(k, n + 1);
  (pending.get(lang) ?? pending.set(lang, new Set()).get(lang)!).add(s);
  if (!timer) timer = setTimeout(flush, 300);
}

/** Translates an English phrase: built-in dictionary first, then the automatic translations; anything else is returned unchanged (and queued). */
export function translate(s: string, lang: Lang = current): string {
  if (lang === 'en' || typeof s !== 'string' || !s) return s;
  const hit = DICT[s]?.[lang]; if (hit) return hit;
  const m = RX ? s.match(RX) : null;
  if (m && m[2] && (m[1] || m[3])) { const core = DICT[m[2]]?.[lang]; if (core) return m[1] + core + m[3]; }
  const rt = RT[lang]?.[s]; if (rt) return rt;
  if (eligible(s) && Date.now() >= backoffUntil) enqueue(lang, s);
  return s;
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (s: string) => string };
const I18nCtx = createContext<Ctx>({ lang: 'en', setLang: () => {}, t: (s) => s });

/** Order of choice: the language you picked on this device → your saved profile language → your device's language (if supported) → the club's default → English. */
export function I18nProvider({ children }: { children: React.ReactNode }) {
  const { settings, session } = useApp();
  const [rev, setRev] = useState(0);
  useEffect(() => { const f = () => setRev((x) => x + 1); subs.add(f); return () => { subs.delete(f); }; }, []);
  const [stored, setStored] = useState<Lang | null | undefined>(undefined);
  const [profLang, setProfLang] = useState<Lang | null>(null);
  // Read separately (not in the main profile query) so a missing column can never affect sign-in or permissions.
  useEffect(() => { setProfLang(null); if (session?.user.id) supabase.from('profiles').select('language').eq('id', session.user.id).maybeSingle().then(({ data }) => setProfLang(norm((data as any)?.language)), () => {}); }, [session?.user.id]);
  useEffect(() => { AsyncStorage.getItem('lang').then((v) => setStored(norm(v))).catch(() => setStored(null)); }, []);
  const lang: Lang = stored === undefined ? 'en' : (stored ?? profLang ?? device() ?? norm(settings.default_language) ?? 'en');
  current = lang; setLangState(lang);
  useEffect(() => { if (lang !== 'en') loadCache(lang); }, [lang]);
  useEffect(() => { if (Platform.OS === 'web') (globalThis as any).document?.documentElement?.setAttribute('lang', lang); }, [lang]);
  const uid = session?.user.id;
  const setLang = useCallback((l: Lang) => {
    setStored(l); if (hasConsent('preferences')) AsyncStorage.setItem('lang', l).catch(() => {});
    if (uid) supabase.from('profiles').update({ language: l }).eq('id', uid).then(() => {}, () => {});
  }, [uid]);
  const t = useCallback((s: string) => translate(s, lang), [lang, rev]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}
export const useI18n = () => useContext(I18nCtx);

/** Translates plain-text children (a string, or the string pieces of a mixed list). */
export function trChildren(children: React.ReactNode, t: (s: string) => string): React.ReactNode {
  if (typeof children === 'string') return t(children);
  if (Array.isArray(children)) return React.Children.map(children, (c) => (typeof c === 'string' ? t(c) : c));
  return children;
}

const LOCALE: Record<Lang, string | undefined> = { en: undefined, fr: 'fr', es: 'es', pt: 'pt', sw: 'sw' };
/** Locale for dates and numbers. English keeps the device's own regional format. */
export const currentLocale = () => LOCALE[current];
