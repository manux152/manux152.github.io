import { useEffect, useState } from 'react';
import { translate } from '../../lib/i18n';
import { Alert, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading } from '../../components/ui';
import { EmailPreview } from '../../components/EmailPreview';
import { supabase } from '../../lib/supabase';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';

const confirmAsk = (msg: string) => new Promise<boolean>((res) => {
  if (Platform.OS === 'web') return res(window.confirm(msg));
  Alert.alert(translate('Send emails?'), translate(msg), [{ text: translate('Cancel'), style: 'cancel', onPress: () => res(false) }, { text: translate('Send'), onPress: () => res(true) }]);
});
const STATUSES = ['applied', 'shortlisted', 'accepted', 'declined', 'joined'];

export default function EmailSend() {
  const params = useLocalSearchParams<{ user?: string; email?: string; name?: string; template?: string }>();
  const { can, settings } = useApp();
  const templates = useTable('email_templates', (q) => q.order('label'));
  const es = useTable('email_settings', (q) => q.eq('id', 1));
  const roles = useTable('roles', (q) => q.order('name'));
  const tryouts = useTable('tryouts', (q) => q.order('starts_at', { ascending: false }).limit(30));
  const members = useTable('profiles', (q) => q.eq('is_active', true).order('full_name').limit(300));
  const [mode, setMode] = useState<string>('template'); const [tplKey, setTplKey] = useState<string | null>(params.template ?? null);
  const [subject, setSubject] = useState(''); const [body, setBody] = useState(''); const [btnLabel, setBtnLabel] = useState(''); const [btnUrl, setBtnUrl] = useState('');
  const [aud, setAud] = useState<string>(params.user ? 'member' : params.email ? 'address' : 'member');
  const [memberIds, setMemberIds] = useState<string[]>(params.user ? [params.user] : []); const [search, setSearch] = useState('');
  const [address, setAddress] = useState(params.email ?? ''); const [addrName, setAddrName] = useState(params.name ?? '');
  const [roleIds, setRoleIds] = useState<string[]>([]); const [tryoutId, setTryoutId] = useState<string | null>(null); const [statuses, setStatuses] = useState<string[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { if (params.template) setTplKey(params.template); }, [params.template]);
  if (!can('emails.manage')) return <Screen><T>No permission.</T></Screen>;
  if (templates.loading || es.loading) return <Loading />;
  const tpls = templates.data as any[]; const theme = (es.data[0] as any)?.theme ?? {};
  const tpl = tpls.find((t) => t.event_key === tplKey);
  const preview = mode === 'template' ? tpl : { subject, body, button_label: btnLabel, button_url: btnUrl };
  const matches = (members.data as any[]).filter((m) => (m.full_name + ' ' + m.email).toLowerCase().includes(search.toLowerCase())).slice(0, 8);

  const audience = () => {
    if (aud === 'member') return memberIds.length ? { type: 'users', user_ids: memberIds } : null;
    if (aud === 'address') return address.trim() ? { type: 'emails', recipients: [{ email: address.trim(), name: addrName.trim() || null }] } : null;
    if (aud === 'roles') return roleIds.length ? { type: 'roles', role_ids: roleIds } : null;
    if (aud === 'all') return { type: 'all_users' };
    if (aud === 'tryout') return tryoutId ? { type: 'tryout', tryout_id: tryoutId, statuses } : null;
    return null;
  };
  const describe = () => aud === 'all' ? 'all members' : aud === 'roles' ? 'everyone in the chosen roles' : aud === 'tryout' ? 'the chosen tryout applicants' : aud === 'member' ? `${memberIds.length} member(s)` : address;
  const body_ = (test: boolean) => ({ manual: { ...(mode === 'template' ? { template_key: tplKey } : { custom: { subject, body, button_label: btnLabel || null, button_url: btnUrl || null } }),
    audience: test ? { type: 'self' } : audience(), test, sample: test } });

  const send = async (test: boolean) => {
    setErr(null); setMsg(null);
    if (mode === 'template' && !tplKey) return setErr('Choose a template or switch to Write my own.');
    if (mode === 'custom' && (!subject.trim() || !body.trim())) return setErr('Add a subject and a message.');
    if (!test && !audience()) return setErr('Choose who to send to.');
    if (!test && ['all', 'roles', 'tryout'].includes(aud) && !(await confirmAsk(`Send this email to ${describe()}?`))) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke('send-email', { body: body_(test) });
    setBusy(false);
    if (error || data?.error) return setErr(data?.error ?? error?.message ?? 'Sending failed');
    setMsg(test ? 'Test sent to your own address.' : `Sent: ${data.sent}${data.skipped ? ` · skipped (opted out): ${data.skipped}` : ''}${data.failed ? ` · failed: ${data.failed}` : ''}`);
  };

  return (
    <Screen>
      <H>Send an email</H>
      <Chips options={[{ value: 'template', label: 'Use a template' }, { value: 'custom', label: 'Write my own' }]} value={mode} onChange={(v) => v && setMode(v)} />
      {mode === 'template'
        ? <Chips options={tpls.map((t) => ({ value: t.event_key, label: t.label }))} value={tplKey} onChange={setTplKey} />
        : <Card>
            <Input label="Subject" value={subject} onChangeText={setSubject} />
            <Input label="Message — {Last_Name} (falls back to {Name}) {first_name} {team} work; blank line = new paragraph" multiline value={body} onChangeText={setBody} style={{ minHeight: 120 }} />
            <Input label="Button text (optional)" value={btnLabel} onChangeText={setBtnLabel} />
            <Input label="Button link (https://… or {app_url})" autoCapitalize="none" value={btnUrl} onChangeText={setBtnUrl} />
          </Card>}
      {preview && (preview.subject || preview.body) ? <EmailPreview theme={theme} team={settings.team_name} subject={preview.subject} body={preview.body} buttonLabel={preview.button_url ? preview.button_label : null} /> : null}

      <H>Send to</H>
      <Chips options={[{ value: 'member', label: 'A member' }, { value: 'address', label: 'An email address' }, { value: 'roles', label: 'By role' }, { value: 'all', label: 'All members' }, { value: 'tryout', label: 'Tryout applicants' }]} value={aud} onChange={(v) => v && setAud(v)} />
      {aud === 'member' && <Card>
        <Input placeholder="Search by name or email" value={search} onChangeText={setSearch} />
        <Chips multi options={matches.map((m) => ({ value: m.id, label: m.full_name || m.email }))} value={memberIds} onChange={setMemberIds} />
        {memberIds.length > 0 && <T muted>{memberIds.length} selected</T>}
      </Card>}
      {aud === 'address' && <Card><Input label="Email address" autoCapitalize="none" keyboardType="email-address" value={address} onChangeText={setAddress} /><Input label="Name (used in the greeting)" value={addrName} onChangeText={setAddrName} /></Card>}
      {aud === 'roles' && <Chips multi options={(roles.data as any[]).map((r) => ({ value: r.id, label: r.name }))} value={roleIds} onChange={setRoleIds} />}
      {aud === 'tryout' && <Card>
        <Chips options={(tryouts.data as any[]).map((t) => ({ value: t.id, label: t.title }))} value={tryoutId} onChange={setTryoutId} />
        <T muted>Only these statuses (none selected = everyone)</T>
        <Chips multi options={STATUSES.map((s) => ({ value: s, label: s }))} value={statuses} onChange={setStatuses} />
      </Card>}
      {['all', 'roles', 'member'].includes(aud) && <T muted>Bulk sends skip members who turned off team emails.</T>}
      <Err msg={err} />{msg ? <T style={{ fontWeight: '700' }}>{msg}</T> : null}
      <Btn title={busy ? 'Sending…' : 'Send'} onPress={() => send(false)} disabled={busy} />
      <Btn title="Send me a test first" kind="ghost" onPress={() => send(true)} disabled={busy} />
    </Screen>
  );
}
