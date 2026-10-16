import { AsyncLocalStorage } from 'node:async_hooks';
// Language helpers shared by the AI functions.
export const LANG_NAMES: Record<string, string> = { en: 'English', fr: 'French', es: 'Spanish', pt: 'Portuguese', sw: 'Swahili' };
export const LOCALES: Record<string, string> = { en: 'en-GB', fr: 'fr-FR', es: 'es-ES', pt: 'pt-PT', sw: 'sw-KE' };
export const pickLang = (v: unknown): string => { const x = String(v ?? '').toLowerCase().slice(0, 2); return x in LANG_NAMES ? x : 'en'; };
/** Appended to every AI system prompt so replies always come back in the language the person chose in the app. */
export const langRule = (lang: string) => lang === 'en' ? '' :
  `\n\nLANGUAGE (most important): the person uses this app in ${LANG_NAMES[lang]}. Write EVERY word you output (headlines, sentences, labels, explanations, list items) in natural, correct ${LANG_NAMES[lang]}, even though your instructions, facts and tool results are in English. Keep people's names, team names, scores, numbers, dates' values and URLs unchanged. If output is JSON, keep the keys in English and write only the values in ${LANG_NAMES[lang]}.`;

// Request-scoped language so the shared `ask()` helpers need no extra parameter (safe with concurrent requests).
const store = new AsyncLocalStorage<string>();
export const activeLang = () => store.getStore() ?? 'en';
export const activeLangRule = () => langRule(activeLang());
export const activeLocale = () => LOCALES[activeLang()] ?? 'en-GB';
export async function langFromReq(req: Request): Promise<string> { try { return pickLang((await req.clone().json())?.lang); } catch { return 'en'; } }
/** Wrap a handler:  Deno.serve(withLang(async (req) => { ... }))  */
export const withLang = (h: (req: Request) => Promise<Response>) => async (req: Request) => store.run(await langFromReq(req), () => h(req));
