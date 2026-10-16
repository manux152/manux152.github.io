import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, H, T, Card, Btn, Chips, Err, Loading } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { useTable } from '../../../lib/useQuery';
import { useApp } from '../../../lib/app-context';
import { shareText } from '../../../lib/share';

const STATUSES = ['applied', 'shortlisted', 'accepted', 'declined', 'joined'];

export default function TryoutApplications() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can, settings } = useApp();
  const router = useRouter();
  const t = useTable('tryouts', (q) => q.eq('id', id), [id]);
  const apps = useTable('tryout_applications', (q) => q.eq('tryout_id', id).order('created_at', { ascending: false }), [id]);
  const fields = useTable('tryout_fields', (q) => q.order('sort_order'));
  const codes = useTable('team_codes', (q) => (can('codes.manage') ? q.not('tryout_application_id', 'is', null).order('created_at', { ascending: false }) : q.limit(0)), [id]);
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  if (!can('tryouts.manage')) return <Screen><T>No permission.</T></Screen>;
  if (t.loading || apps.loading) return <Loading />;
  const tr: any = t.data[0];
  const label = (k: string) => (fields.data as any[]).find((f) => f.key === k)?.label ?? k;
  const list = apps.data as any[];
  const codeFor = (appId: string) => (codes.data as any[]).find((c) => c.tryout_application_id === appId);

  const setStatus = async (a: any, s: string | null) => {
    if (!s || s === a.status) return;
    const { error } = await supabase.from('tryout_applications').update({ status: s }).eq('id', a.id);
    if (error) setErr(error.message); await apps.refresh();
  };
  const makeCode = async (a: any) => {
    setErr(null); setMsg(null);
    const { data, error } = await supabase.rpc('generate_team_codes', { n: 1, p_email: a.applicant_email, p_expires_days: 30, p_note: `Tryout: ${tr?.title} – ${a.applicant_name}`, p_application: a.id });
    if (error) return setErr(error.message);
    if (a.status === 'applied' || a.status === 'shortlisted') await supabase.from('tryout_applications').update({ status: 'accepted' }).eq('id', a.id);
    await apps.refresh(); await codes.refresh();
    if (data?.[0]) await share(data[0], a);
  };
  const share = async (c: any, a: any) => setMsg(await shareText(
    `Congratulations ${a.applicant_name}! You've been selected for ${settings.team_name ?? 'the team'}. Create your player account in the app with ${a.applicant_email} and this one-time team code: ${c.code}`));

  return (
    <Screen>
      <H>{tr?.title ?? 'Tryout'}</H>
      <T muted>{list.length} application(s){tr?.capacity ? ` · ${tr.capacity} places` : ''}</T>
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
      {list.length === 0 && <T muted>No applications yet.</T>}
      {list.map((a) => {
        const c = codeFor(a.id);
        return (
          <Card key={a.id}>
            <T style={{ fontWeight: '800' }}>{a.applicant_name}</T><T muted>{a.applicant_email}</T>
            {Object.entries(a.answers ?? {}).map(([k, v]) => <T key={k}><T muted>{label(k)}: </T>{String(v)}</T>)}
            {can('emails.manage') && <Btn title="Email applicant" kind="ghost" onPress={() => router.push(`/admin/email-send?email=${encodeURIComponent(a.applicant_email)}&name=${encodeURIComponent(a.applicant_name)}` as any)} />}
            <Chips options={STATUSES.map((s) => ({ value: s, label: s }))} value={a.status} onChange={(v) => setStatus(a, v)} />
            {can('codes.manage') && (c
              ? <><T style={{ fontWeight: '700' }}>{c.used_at ? 'Code used — player has joined ✓' : `Code: ${c.code}`}</T>{!c.used_at && <Btn title="Share / copy code" kind="ghost" onPress={() => share(c, a)} />}</>
              : a.status !== 'declined' && <Btn title="Accept & generate team code" onPress={() => makeCode(a)} />)}
          </Card>
        );
      })}
    </Screen>
  );
}
