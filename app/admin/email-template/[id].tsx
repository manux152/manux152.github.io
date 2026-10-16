import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, H, T, Card, Btn, Err, Loading } from '../../../components/ui';
import { EmailPreview } from '../../../components/EmailPreview';
import { supabase } from '../../../lib/supabase';
import { useTable } from '../../../lib/useQuery';
import { useApp } from '../../../lib/app-context';

export default function TemplatePreview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can, settings } = useApp();
  const router = useRouter();
  const tpl = useTable('email_templates', (q) => q.eq('id', id), [id]);
  const es = useTable('email_settings', (q) => q.eq('id', 1));
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (!can('emails.manage')) return <Screen><T>No permission.</T></Screen>;
  if (tpl.loading || es.loading) return <Loading />;
  const t: any = tpl.data[0];
  if (!t) return <Screen><T muted>Template not found.</T></Screen>;
  const theme = (es.data[0] as any)?.theme ?? {};

  const test = async () => {
    setErr(null); setMsg(null); setBusy(true);
    const { data, error } = await supabase.functions.invoke('send-email', { body: { manual: { template_key: t.event_key, audience: { type: 'self' }, sample: true, test: true } } });
    setBusy(false);
    if (error || data?.error) setErr(data?.error ?? error?.message ?? 'Could not send'); else setMsg('Test sent to your account address.');
  };
  return (
    <Screen>
      <H>{t.label}</H>
      <T muted>{t.enabled ? 'Sent automatically' : 'Automatic sending is off'} · key: {t.event_key}</T>
      <EmailPreview theme={theme} team={settings.team_name} subject={t.subject} body={t.body} buttonLabel={t.button_url ? t.button_label : null} />
      {t.variables ? <Card><T muted>Placeholders you can use: {t.variables}</T></Card> : null}
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
      <Btn title={busy ? 'Sending…' : 'Send me a test'} onPress={test} disabled={busy} />
      <Btn title="Send to people…" kind="ghost" onPress={() => router.push(`/admin/email-send?template=${t.event_key}` as any)} />
      <Btn title="Edit text" kind="ghost" onPress={() => router.push('/admin/manage/emailTemplates' as any)} />
    </Screen>
  );
}
