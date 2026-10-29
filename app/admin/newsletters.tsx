import { useEffect, useState } from 'react';
import { Pressable } from 'react-native';
import { Screen, H, T, Card, Btn, Input, Chips, Err } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';

const AUDIENCES = [{ value: 'both', label: 'Fans + members' }, { value: 'fans', label: 'Fans only' }, { value: 'members', label: 'Members only' }];
const TOPICS = [{ value: '', label: 'All fans' }, { value: 'news', label: 'Club news' }, { value: 'matches', label: 'Match days' }, { value: 'shop', label: 'Shop' }, { value: 'events', label: 'Events' }];
type Form = { id: string | null; subject: string; body: string; audience: string; topic: string };
const EMPTY: Form = { id: null, subject: '', body: '', audience: 'both', topic: '' };

// Admin → Newsletters: write, test and send to the fan club and/or members. Everyone is emailed from your Email design sender.
export default function Newsletters() {
  const { can, session } = useApp();
  const [f, setF] = useState<Form>(EMPTY); const [items, setItems] = useState<any[]>([]); const [counts, setCounts] = useState<{ fans: number; members: number } | null>(null);
  const [tpls, setTpls] = useState<any[]>([]); const [tplKey, setTplKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null); const [confirm, setConfirm] = useState(false);
  const set = (p: Partial<Form>) => { setF((c) => ({ ...c, ...p })); setMsg(null); setConfirm(false); };

  const load = async () => { const { data } = await supabase.from('newsletters').select('*').order('created_at', { ascending: false }).limit(30); setItems(data ?? []); };
  useEffect(() => { load(); }, []);
  // Ready-made newsletter texts (Admin → Emails): picking one fills in the subject and the message.
  useEffect(() => { supabase.from('email_templates').select('event_key,label,subject,body').ilike('event_key', 'newsletter_%').order('label').then(({ data }) => setTpls(data ?? [])); }, []);
  useEffect(() => { supabase.rpc('newsletter_audience_counts', { p_topic: f.topic || null }).then(({ data }) => { if (data) setCounts(data as any); }); }, [f.topic]);
  if (!can('newsletters.manage')) return <Screen><T>No permission.</T></Screen>;

  const people = !counts ? null : f.audience === 'fans' ? counts.fans : f.audience === 'members' ? counts.members : counts.fans + counts.members;
  const save = async (): Promise<string | null> => {
    if (!f.subject.trim()) { setErr('Add a subject.'); return null; }
    if (!f.body.trim()) { setErr('Write the message.'); return null; }
    const row = { subject: f.subject.trim(), body: f.body, audience: f.audience, topic: f.audience === 'members' ? null : (f.topic || null), updated_at: new Date().toISOString() };
    if (f.id) { const { error } = await supabase.from('newsletters').update(row).eq('id', f.id); if (error) { setErr(error.message); return null; } return f.id; }
    const { data, error } = await supabase.from('newsletters').insert({ ...row, created_by: session?.user.id }).select('id').single();
    if (error) { setErr(error.message); return null; }
    setF((c) => ({ ...c, id: data.id })); return data.id;
  };
  const pickTemplate = (key: string | null) => {
    setTplKey(key); const t = tpls.find((x) => x.event_key === key);
    if (t) set({ subject: t.subject, body: t.body });
  };
  const run = async (fn: () => Promise<void>) => { setErr(null); setMsg(null); setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const saveDraft = () => run(async () => { const id = await save(); if (id) { setMsg('Draft saved.'); load(); } });
  const sendTest = () => run(async () => {
    const id = await save(); if (!id) return;
    const { error } = await supabase.functions.invoke('send-newsletter', { body: { action: 'test', id } });
    if (error) return setErr(error.message); setMsg(`Test sent to ${session?.user.email}. Check your inbox (and spam).`); load();
  });
  const sendNow = () => {
    const tplUnchanged = tplKey && tpls.find((x) => x.event_key === tplKey)?.body === f.body;
    if (tplUnchanged) { setErr('Replace the template text (the “Add your…” lines) with your own news before sending.'); return; }
    if (!confirm) { setConfirm(true); return; }
    return run(async () => {
      setConfirm(false);
      const id = await save(); if (!id) return;
      const { data, error } = await supabase.functions.invoke('send-newsletter', { body: { action: 'send', id } });
      await load();
      if (error) return setErr(error.message);
      setMsg(`Sent to ${data?.sent ?? 0} ${data?.sent === 1 ? 'person' : 'people'}${data?.failed ? `, ${data.failed} failed (see Email log)` : ''}.`); setF(EMPTY); setTplKey(null);
    });
  };
  const open = (n: any) => {
    const editable = n.status === 'draft' || n.status === 'failed';
    setF({ id: editable ? n.id : null, subject: n.subject, body: n.body, audience: n.audience, topic: n.topic ?? '' }); setErr(null); setConfirm(false); setTplKey(null);
    setMsg(editable ? null : 'Copied into a new draft. The original stays in your history.');
  };

  return (
    <Screen>
      <H>Newsletters</H>
      <T muted>Write once, send to your fan club and/or members. Fans get an unsubscribe link automatically; members can opt out under Account → Team emails.</T>
      <Card>
        {tpls.length > 0 ? <>
          <T style={{ fontWeight: '700' }}>Start from a template</T>
          <Chips options={tpls.map((t) => ({ value: t.event_key, label: String(t.label).replace(/^Newsletter:\s*/i, '') }))} value={tplKey} onChange={pickTemplate} />
          <T muted style={{ fontSize: 12 }}>Fills in the subject and message for you (this replaces what is below). Edit anything, and replace the “Add your…” lines before sending.</T>
        </> : null}
        <Input label="Subject" value={f.subject} onChangeText={(v) => set({ subject: v })} />
        <Input label="Message" multiline value={f.body} onChangeText={(v) => set({ body: v })} style={{ minHeight: 200, textAlignVertical: 'top' }} />
        <T muted style={{ fontSize: 12 }}>A blank line starts a new paragraph. **bold** makes bold text. [link text](https://…) adds a link. {'{first_name}'} puts in the person's first name.</T>
        <T style={{ fontWeight: '700' }}>Send to</T>
        <Chips options={AUDIENCES} value={f.audience} onChange={(v) => v && set({ audience: v })} />
        {f.audience !== 'members' ? <><T muted>Fans interested in</T><Chips options={TOPICS} value={f.topic} onChange={(v) => set({ topic: v ?? '' })} /></> : null}
        {people != null ? <T muted>About {people} {people === 1 ? 'person' : 'people'} will get this (duplicates are removed).</T> : null}
      </Card>
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
      <Btn title="Save draft" kind="ghost" onPress={saveDraft} disabled={busy} />
      <Btn title="Send me a test" kind="ghost" onPress={sendTest} disabled={busy} />
      <Btn title={busy ? 'Working…' : confirm ? `Tap again to send to ${people ?? 'everyone'}` : 'Send newsletter'} onPress={sendNow} disabled={busy} />
      {f.id || f.subject || f.body ? <Btn title="Start a new one" kind="ghost" onPress={() => { setF(EMPTY); setMsg(null); setErr(null); setConfirm(false); setTplKey(null); }} /> : null}

      <H style={{ fontSize: 20 }}>History</H>
      {items.length === 0 ? <T muted>Nothing yet.</T> : items.map((n) => (
        <Pressable key={n.id} accessibilityRole="button" onPress={() => open(n)}>
          <Card>
            <T style={{ fontWeight: '700' }}>{n.subject}</T>
            <T muted style={{ fontSize: 12 }}>{n.status}{n.status === 'sent' ? ` · ${n.sent_count} sent${n.failed_count ? `, ${n.failed_count} failed` : ''}` : ''} · {new Date(n.sent_at ?? n.created_at).toLocaleString()}</T>
            {n.last_error ? <T muted style={{ fontSize: 12 }}>{n.last_error}</T> : null}
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}
