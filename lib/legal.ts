import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { useApp } from './app-context';
import { deviceInfo, getDeviceId, isCrawler } from './consent';

export type Section = { heading: string; body: string };
export type Slug = 'terms' | 'privacy' | 'cookies';
export type LegalDoc = { id: string; slug: Slug; version: number; title: string; summary: string | null; sections: Section[]; published_at: string };
export const REQUIRED: Slug[] = ['terms', 'privacy'];

/** Fills {{team}} and {{email}} in the document text. */
export function fill(text: string, vars: { team?: string; email?: string }) {
  return text.replace(/\{\{team\}\}/g, vars.team || 'the club').replace(/\{\{email\}\}/g, vars.email || 'the contact address shown on this website');
}
/** Splits a section into paragraphs and "- " bullet lines. */
export function blocks(body: string): { bullet: boolean; text: string }[] {
  return body.split(/\n+/).map((l) => l.trim()).filter(Boolean).map((l) => (l.startsWith('- ') ? { bullet: true, text: l.slice(2) } : { bullet: false, text: l }));
}
export async function fetchDocs(slugs?: Slug[]): Promise<LegalDoc[]> {
  let q = supabase.from('legal_documents').select('id,slug,version,title,summary,sections,published_at').eq('is_current', true);
  if (slugs) q = q.in('slug', slugs);
  const { data, error } = await q;
  return error ? [] : ((data ?? []) as LegalDoc[]);
}

const LOCAL = 'legal:accepted:v1'; const LINKED = 'legal:linked:v1:'; const AT = 'legal:at:v1'; const DAY = 864e5;
const readAt = async () => { try { return Number(await AsyncStorage.getItem(AT)) || 0; } catch { return 0; } };
const readLocal = async (): Promise<Record<string, number>> => { try { return JSON.parse((await AsyncStorage.getItem(LOCAL)) ?? '{}'); } catch { return {}; } };
const writeLocal = async (docs: LegalDoc[]) => { const m = await readLocal(); docs.forEach((d) => { m[d.slug] = d.version; }); try { await AsyncStorage.setItem(LOCAL, JSON.stringify(m)); await AsyncStorage.setItem(AT, String(Date.now())); } catch { /* ignore */ } };

async function record(docs: LegalDoc[]) {
  const d = deviceInfo();
  return supabase.rpc('legal_accept', { p_device: await getDeviceId(), p_docs: docs.map((x) => ({ slug: x.slug, version: x.version })), p_platform: d.platform, p_ua: d.ua, p_locale: d.locale });
}

export type LegalStatus = 'checking' | 'ok' | 'needed';
/**
 * Decides whether this person must read and accept the Terms and Privacy Policy before continuing.
 * They must accept again whenever a new version is published, and again after the re-accept period set in Admin (default 90 days). Acceptance is saved to the database as evidence.
 */
export function useLegalStatus() {
  const { session, settings } = useApp(); const uid = session?.user.id ?? null;
  const [status, setStatus] = useState<LegalStatus>('checking'); const [docs, setDocs] = useState<LegalDoc[]>([]); const [error, setError] = useState<string | null>(null); const [renewal, setRenewal] = useState(false);
  const rd = settings.legal_reaccept_days == null ? 90 : Number(settings.legal_reaccept_days); const reDays = Number.isFinite(rd) ? rd : 90;   // 0 = never ask again for the same version
  const enabled = settings.legal_gate_enabled !== false && settings.legal_gate_enabled !== 'false';

  const check = useCallback(async () => {
    if (!enabled || isCrawler()) return setStatus('ok');
    const all = (await fetchDocs(REQUIRED)).sort((a, b) => a.slug.localeCompare(b.slug)).reverse();   // terms first
    if (!all.length) return setStatus('ok');          // documents not set up yet: do not lock everyone out
    setDocs(all);
    if (uid) {
      // Signed in: this ACCOUNT must have accepted (at sign-up, or by reading the full terms once). A visitor's quick "I agree" on this device does not count.
      const acct = await supabase.rpc('legal_needed_account');
      if (!acct.error && Array.isArray(acct.data)) {
        setRenewal(false);
        if (acct.data.length === 0) { await writeLocal(all); return setStatus('ok'); }
        return setStatus('needed');
      }
      // (database update 039 not applied yet: fall back to the older device-based check below)
    }
    const local = await readLocal();
    if (all.every((d) => local[d.slug] === d.version)) {
      let at = await readAt();
      if (!at) { at = Date.now(); AsyncStorage.setItem(AT, String(at)).catch(() => {}); }     // accepted before this feature existed: the clock starts now
      if (reDays <= 0 || Date.now() - at < reDays * DAY) {
        setRenewal(false); setStatus('ok');
        // When someone signs in on a device that already accepted, also record the acceptance against their account.
        if (uid) { const tag = LINKED + uid; const sig = all.map((d) => `${d.slug}${d.version}`).join(','); if ((await AsyncStorage.getItem(tag).catch(() => null)) !== sig) { const r = await record(all); if (!r.error) AsyncStorage.setItem(tag, sig).catch(() => {}); } }
        return;
      }
      setRenewal(true);       // same version, but it has been too long: ask again
    } else setRenewal(false);
    if (uid) {      // already accepted on another device?
      const r = await supabase.rpc('legal_needed', { p_device: await getDeviceId() });
      if (!r.error && Array.isArray(r.data) && r.data.length === 0) { await writeLocal(all); return setStatus('ok'); }
    }
    setStatus('needed');
  }, [uid, enabled, reDays]);
  useEffect(() => { check(); }, [check]);
  useEffect(() => { const sub = AppState.addEventListener('change', (st) => { if (st === 'active') check(); }); return () => sub.remove(); }, [check]);   // coming back after a long break

  const accept = useCallback(async (): Promise<boolean> => {
    setError(null);
    const r = await record(docs);
    if (r.error) {
      if (/outdated/i.test(r.error.message)) { setError('These documents were just updated. Please review the new version.'); setStatus('checking'); check(); }
      else setError('We could not save your acceptance. Check your connection and try again.');
      return false;
    }
    await writeLocal(docs); AsyncStorage.setItem(LINKED + (uid ?? ''), docs.map((d) => `${d.slug}${d.version}`).join(',')).catch(() => {});
    setStatus('ok'); return true;
  }, [docs, check, uid]);
  return { status, docs, accept, error, retry: check, renewal, visitor: !uid };
}
