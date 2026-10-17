import { useCallback, useEffect, useState } from 'react';
import { Screen, H, T, Card, Btn, Chips, Input, Err, Loading, fmtDate } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';
import { fetchDocs, type Section, type Slug } from '../../lib/legal';

const DOCS = [{ value: 'terms', label: 'Terms of Use' }, { value: 'privacy', label: 'Privacy Policy' }, { value: 'cookies', label: 'Cookie Policy' }];

/** Admin → Legal documents. Published versions are never edited: changes are published as a new version, and everyone must accept it again. */
export default function LegalAdmin() {
  const { can, settings, reload } = useApp();
  const [slug, setSlug] = useState<Slug>('terms'); const [ver, setVer] = useState(0);
  const [title, setTitle] = useState(''); const [summary, setSummary] = useState(''); const [secs, setSecs] = useState<Section[]>([]);
  const [history, setHistory] = useState<{ version: number; published_at: string }[]>([]);
  const [email, setEmail] = useState(typeof settings.legal_contact_email === 'string' ? settings.legal_contact_email : '');
  const [loading, setLoading] = useState(true); const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null); setConfirm(false);
    const [d, h] = await Promise.all([fetchDocs([slug]), supabase.from('legal_documents').select('version,published_at').eq('slug', slug).order('version', { ascending: false })]);
    const cur = d[0]; setVer(cur?.version ?? 0); setTitle(cur?.title ?? ''); setSummary(cur?.summary ?? ''); setSecs(cur?.sections ?? [{ heading: '', body: '' }]);
    setHistory((h.data ?? []) as any); setLoading(false);
  }, [slug]);
  useEffect(() => { load(); }, [load]);
  if (!can('settings.manage')) return <Screen><T>No permission.</T></Screen>;

  const upd = (i: number, k: keyof Section, v: string) => setSecs((s) => s.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const move = (i: number, d: number) => setSecs((s) => { const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const saveEmail = async () => {
    setErr(null); setMsg(null); const e = email.trim();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return setErr('Enter a valid email address.');
    const { error } = await supabase.from('site_settings').upsert({ key: 'legal_contact_email', value: e }, { onConflict: 'key' });
    if (error) return setErr(error.message); await reload(); setMsg('Contact email saved. It appears wherever the documents say {{email}}.');
  };
  const publish = async () => {
    setErr(null); setMsg(null);
    if (secs.some((s) => !s.heading.trim() || !s.body.trim())) { setConfirm(false); return setErr('Every section needs a heading and text. Remove empty sections.'); }
    setBusy(true);
    const { data, error } = await supabase.rpc('legal_publish', { p_slug: slug, p_title: title, p_summary: summary, p_sections: secs.map((s) => ({ heading: s.heading.trim(), body: s.body.trim() })) });
    setBusy(false); setConfirm(false);
    if (error) return setErr(error.message);
    setMsg(`Published version ${data}.${slug === 'cookies' ? '' : ' Everyone will be asked to read and accept it the next time they open the app or website.'}`); load();
  };

  return (
    <Screen>
      <H>Legal documents</H>
      <T muted>Each document is split into sections people open and read. Published versions are never changed. Publishing creates a new version with a new date, and the Terms and Privacy Policy must then be accepted again by everyone.</T>
      <Card>
        <T style={{ fontWeight: '800' }}>Contact email shown in the documents</T>
        <Input label="Email (replaces {{email}})" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
        <Btn title="Save email" kind="ghost" onPress={saveEmail} />
      </Card>
      <Chips options={DOCS} value={slug} onChange={(v) => v && setSlug(v as Slug)} />
      {loading ? <Loading /> : <>
        <T muted>{ver ? `Live version: ${ver}` : 'Not published yet'}</T>
        <Card>
          <Input label="Title" value={title} onChangeText={setTitle} />
          <Input label="One-line summary (optional)" value={summary} onChangeText={setSummary} multiline />
        </Card>
        {secs.map((s, i) => (
          <Card key={i}>
            <T style={{ fontWeight: '800' }}>Section {i + 1}</T>
            <Input label="Heading" value={s.heading} onChangeText={(v) => upd(i, 'heading', v)} />
            <Input label="Text (blank line = new paragraph, start a line with - for a bullet)" value={s.body} onChangeText={(v) => upd(i, 'body', v)} multiline style={{ minHeight: 120 }} />
            <Btn title="Move up" kind="ghost" onPress={() => move(i, -1)} disabled={i === 0} />
            <Btn title="Move down" kind="ghost" onPress={() => move(i, 1)} disabled={i === secs.length - 1} />
            <Btn title="Remove section" kind="danger" onPress={() => setSecs((c) => (c.length > 1 ? c.filter((_, j) => j !== i) : c))} disabled={secs.length <= 1} />
          </Card>))}
        <Btn title="Add section" kind="ghost" onPress={() => setSecs((c) => (c.length < 40 ? [...c, { heading: '', body: '' }] : c))} />
        <T muted style={{ fontSize: 13 }}>Use {'{{team}}'} for the club name and {'{{email}}'} for the contact email. The starting text is a professional template, not legal advice. Have a lawyer review it before relying on it.</T>
        <Err msg={err} />{msg ? <T style={{ fontWeight: '700' }}>{msg}</T> : null}
        {confirm
          ? <Card><T style={{ fontWeight: '800' }}>Publish version {ver + 1}?</T><T>{slug === 'cookies' ? 'The new Cookie Policy goes live immediately.' : 'Every user will have to read and accept the new version before continuing.'} This cannot be edited afterwards, only replaced by a newer version.</T>
              <Btn title={busy ? 'Publishing…' : 'Yes, publish'} onPress={publish} disabled={busy} /><Btn title="Cancel" kind="ghost" onPress={() => setConfirm(false)} /></Card>
          : <Btn title={`Publish as version ${ver + 1}`} onPress={() => { setErr(null); setMsg(null); setConfirm(true); }} />}
        {history.length ? <Card><T style={{ fontWeight: '800' }}>Version history</T>{history.map((h) => <T key={h.version} muted style={{ fontSize: 13 }}>Version {h.version} · {fmtDate(h.published_at)}{h.version === ver ? ' (live)' : ''}</T>)}</Card> : null}
      </>}
    </Screen>
  );
}
