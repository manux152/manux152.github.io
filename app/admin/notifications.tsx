import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable } from 'react-native';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';

export default function Notifications() {
  const { can, session } = useApp();
  const roles = useTable('roles', (q) => q.order('name'));
  const queue = useTable('notification_queue', (q) => q.order('created_at', { ascending: false }).limit(15));
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [route, setRoute] = useState('');
  const [aud, setAud] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [ok, setOk] = useState<string | null>(null);
  if (!can('notifications.manage')) return <Screen><T>No permission.</T></Screen>;
  if (roles.loading) return <Loading />;

  const runReminders = async () => {
    setErr(null); setOk(null);
    const { data, error } = await supabase.rpc('run_match_reminders');
    if (error) return setErr(error.message);
    setOk(`${data} reminder(s) queued.`); await queue.refresh();
  };
  const send = async () => {
    setErr(null); setOk(null);
    if (!title.trim()) return setErr('Title is required');
    setBusy(true);
    const { data, error } = await supabase.from('notification_queue').insert({
      title: title.trim(), body: body.trim(), data: route.trim() ? { route: route.trim() } : {},
      audience_role_ids: aud.length ? aud : null, created_by: session?.user.id }).select('id').single();
    if (error) { setBusy(false); return setErr(error.message); }
    const { data: res, error: fnErr } = await supabase.functions.invoke('send-push', { body: { queue_id: data.id } });
    setBusy(false);
    if (fnErr) return setErr(`Queued, but sending failed: ${fnErr.message}`);
    setOk(res?.skipped ? 'Already being sent.' : `Sent to ${res?.sent ?? 0} device(s).`);
    setTitle(''); setBody(''); setRoute(''); setAud([]); await queue.refresh();
  };

  return (
    <Screen><H>Notifications</H>
      <Card><T style={{ fontWeight: '700' }}>Send a message</T>
        <Input label="Title" value={title} onChangeText={setTitle} />
        <Input label="Message" multiline value={body} onChangeText={setBody} />
        <Input label="Open screen on tap (optional, e.g. /news or /matches)" autoCapitalize="none" value={route} onChangeText={setRoute} />
        <T muted>Audience (leave empty for everyone)</T>
        <Chips multi options={(roles.data as any[]).map((r) => ({ value: r.id, label: r.name }))} value={aud} onChange={setAud} />
        <Err msg={err} />{ok ? <T>{ok}</T> : null}
        <Btn title={busy ? 'Sending…' : 'Send now'} onPress={send} disabled={busy} /></Card>
      <Card><T style={{ fontWeight: '700' }}>Match reminders</T><T muted>Sent automatically before each match (see README). Use this to run the check now.</T>
        <Btn title="Send due reminders now" kind="ghost" onPress={runReminders} /></Card>
      <Link href="/admin/manage/notificationRules" asChild><Pressable><Card><T style={{ fontWeight: '700' }}>Automatic notification rules →</T>
        <T muted>Turn automatic alerts on/off and edit their wording.</T></Card></Pressable></Link>
      <H>Recent</H>
      {(queue.data as any[]).map((q) => (
        <Card key={q.id}><T style={{ fontWeight: '700' }}>{q.title}</T><T muted>{q.status}{q.status === 'sent' ? ` · ${q.sent_count} device(s)` : ''}{q.error ? ` · ${q.error}` : ''}</T></Card>
      ))}
    </Screen>
  );
}
