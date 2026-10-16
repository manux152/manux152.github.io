import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading, fmtDate } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useTable } from '../../lib/useQuery';

export default function TryoutDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tr = useTable('tryouts', (q) => q.eq('id', id), [id]);
  const fields = useTable('tryout_fields', (q) => q.eq('is_active', true).order('sort_order'));
  const [name, setName] = useState(''); const [email, setEmail] = useState('');
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [err, setErr] = useState<string | null>(null); const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  if (tr.loading || fields.loading) return <Loading />;
  const t: any = tr.data[0];
  if (!t) return <Screen><T muted>Tryout not found.</T></Screen>;
  const open = t.applications_open && (!t.apply_by || new Date(t.apply_by) > new Date());

  const submit = async () => {
    setErr(null);
    if (!name.trim()) return setErr('Please enter your name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setErr('Please enter a valid email address.');
    for (const f of fields.data as any[]) if (f.required && !String(answers[f.key] ?? '').trim()) return setErr(`${f.label} is required`);
    setBusy(true);
    // No .select(): applicants have no account and cannot read applications back
    const { error } = await supabase.from('tryout_applications').insert({ tryout_id: id, applicant_name: name.trim(), applicant_email: email.trim(), answers });
    setBusy(false);
    if (error) return setErr(error.code === '23505' ? 'You have already applied to this tryout.' : 'Sorry, we could not send your application. Please try again.');
    setDone(true);
  };

  return (
    <Screen>
      <H>{t.title}</H>
      <T muted>{fmtDate(t.starts_at)}{t.ends_at ? ` – ${new Date(t.ends_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}</T>
      {t.location ? <T>📍 {t.location}</T> : null}
      {t.age_group ? <T muted>Age group: {t.age_group}</T> : null}
      {t.capacity ? <T muted>Places: {t.capacity}</T> : null}
      {t.description ? <Card><T>{t.description}</T></Card> : null}
      {done ? <Card><T style={{ fontWeight: '700' }}>Application sent 🎉</T><T muted>The coaches will review it. If you are selected, you will be given a one-time team code to create your player account.</T></Card>
        : !open ? <Card><T muted>Applications for this tryout are closed.</T></Card>
        : (<>
          <H>Apply</H>
          <Input label="Full name *" value={name} onChangeText={setName} />
          <Input label="Email *" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
          {(fields.data as any[]).map((f) => f.type === 'select' ? (
            <Card key={f.id}><T muted>{f.label}{f.required ? ' *' : ''}</T>
              <Chips options={((f.options ?? []) as string[]).map((o) => ({ value: o, label: o }))} value={answers[f.key] ?? null} onChange={(v) => setAnswers({ ...answers, [f.key]: v })} /></Card>
          ) : (
            <Input key={f.id} label={`${f.label}${f.required ? ' *' : ''}`} multiline={f.type === 'longtext'} keyboardType={f.type === 'number' ? 'numeric' : 'default'}
              value={String(answers[f.key] ?? '')} onChangeText={(v) => setAnswers({ ...answers, [f.key]: v })} />
          ))}
          <Err msg={err} /><Btn title="Send application" onPress={submit} disabled={busy} />
        </>)}
    </Screen>
  );
}
