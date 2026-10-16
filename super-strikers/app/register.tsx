import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useApp } from '../lib/app-context';
import { useTable } from '../lib/useQuery';

export default function Register() {
  const { session, settings } = useApp();
  const fields = useTable('registration_fields', (q) => q.eq('is_active', true).order('sort_order'));
  const [reg, setReg] = useState<any | null | undefined>(undefined);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!session) return;
    const { data } = await supabase.from('registrations').select('*').eq('user_id', session.user.id).maybeSingle();
    setReg(data ?? null); if (data) setAnswers(data.answers ?? {});
  };
  useEffect(() => { load(); }, [session?.user.id]); // eslint-disable-line

  if (!session) return <Redirect href="/login" />;
  if (reg === undefined || fields.loading) return <Loading />;

  if (reg && reg.status !== 'rejected') return (
    <Screen><H>Registration</H>
      <Card><T style={{ fontWeight: '700' }}>{reg.status === 'approved' ? 'You\'re in! 🎉' : 'Application received'}</T>
        <T muted>{reg.status === 'approved' ? 'Your registration was approved. Welcome to the team.' : 'The team will review it soon.'}</T>
        {reg.review_note ? <T>{reg.review_note}</T> : null}</Card>
    </Screen>
  );
  if (!reg && settings.registration_open === false) return <Screen><H>Registration</H><T muted>Registration is currently closed.</T></Screen>;

  const submit = async () => {
    setErr(null);
    for (const f of fields.data as any[]) if (f.required && !String(answers[f.key] ?? '').trim()) return setErr(`${f.label} is required`);
    setBusy(true);
    const row = { user_id: session.user.id, answers, status: 'pending' };
    const { error } = reg ? await supabase.from('registrations').update(row).eq('id', reg.id) : await supabase.from('registrations').insert(row);
    setBusy(false);
    if (error) return setErr(error.message);
    await load();
  };

  return (
    <Screen><H>Join {settings.team_name ?? 'the team'}</H>
      {reg?.status === 'rejected' && <Card><T style={{ fontWeight: '700' }}>Your last application wasn't approved.</T>{reg.review_note ? <T muted>{reg.review_note}</T> : null}<T muted>You can update it and resubmit below.</T></Card>}
      {(fields.data as any[]).map((f) => f.type === 'select' ? (
        <Card key={f.id}><T muted>{f.label}{f.required ? ' *' : ''}</T>
          <Chips options={((f.options ?? []) as string[]).map((o) => ({ value: o, label: o }))} value={answers[f.key] ?? null} onChange={(v) => setAnswers({ ...answers, [f.key]: v })} /></Card>
      ) : (
        <Input key={f.id} label={`${f.label}${f.required ? ' *' : ''}`} multiline={f.type === 'longtext'} keyboardType={f.type === 'number' ? 'numeric' : 'default'}
          value={String(answers[f.key] ?? '')} onChangeText={(v) => setAnswers({ ...answers, [f.key]: v })} />
      ))}
      <Err msg={err} /><Btn title={reg ? 'Resubmit' : 'Submit registration'} onPress={submit} disabled={busy} />
    </Screen>
  );
}
