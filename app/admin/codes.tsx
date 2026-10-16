import { useState } from 'react';
import { Switch, View } from 'react-native';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';
import { shareText } from '../../lib/share';

export default function Codes() {
  const { can, settings } = useApp();
  const roles = useTable('roles', (q) => q.order('name'));
  const codes = useTable('team_codes', (q) => q.order('created_at', { ascending: false }).limit(150).select('*, roles(name), profiles:used_by(full_name,email)'));
  const [count, setCount] = useState('1'); const [role, setRole] = useState<string | null>(null);
  const [email, setEmail] = useState(''); const [days, setDays] = useState('30'); const [any, setAny] = useState(false); const [note, setNote] = useState('');
  const [fresh, setFresh] = useState<any[]>([]); const [filter, setFilter] = useState<string | null>('unused');
  const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (!can('codes.manage')) return <Screen><T>No permission.</T></Screen>;
  if (roles.loading || codes.loading) return <Loading />;
  const domains: string[] = Array.isArray(settings.allowed_email_domains) ? settings.allowed_email_domains : [];
  const status = (c: any) => c.used_at ? 'used' : c.expires_at && new Date(c.expires_at) < new Date() ? 'expired' : 'unused';

  const generate = async () => {
    setErr(null); setMsg(null); setBusy(true);
    const { data, error } = await supabase.rpc('generate_team_codes', {
      n: Math.max(1, Math.min(100, Number(count) || 1)), p_role_id: role, p_email: email.trim() || null,
      p_expires_days: days.trim() ? Number(days) : null, p_bypass_domain: any, p_note: note.trim() || null });
    setBusy(false);
    if (error) return setErr(error.message);
    setFresh(data ?? []); await codes.refresh();
  };
  const share = async (c: any) => {
    const txt = `Welcome to ${settings.team_name ?? 'the team'}! Create your player account in the app using ${c.email ? `your email (${c.email})` : 'your team email'} and this one-time team code: ${c.code}${c.expires_at ? ` (valid until ${new Date(c.expires_at).toLocaleDateString()})` : ''}`;
    setMsg(await shareText(txt));
  };
  const revoke = async (c: any) => { await supabase.from('team_codes').delete().eq('id', c.id).is('used_at', null); await codes.refresh(); };
  const list = (codes.data as any[]).filter((c) => !filter || status(c) === filter);

  return (
    <Screen>
      <H>Team codes</H>
      <Card>
        <T muted>Every code works once. {settings.signup_requires_code === false ? 'Sign-up is currently OPEN (codes not required) — change signup_requires_code in Site settings.' : 'Sign-up requires a code.'}</T>
        <T muted>{domains.length ? `Allowed email domains: ${domains.map((d) => '@' + d).join(', ')}` : 'No email-domain restriction set. Add domains in Site settings → allowed_email_domains, e.g. ["superstrikers.com"].'}</T>
      </Card>
      <Card>
        <T style={{ fontWeight: '700' }}>Generate codes</T>
        <Input label="How many" keyboardType="numeric" value={count} onChangeText={setCount} />
        <T muted>Role given on sign-up (blank = default player role)</T>
        <Chips options={(roles.data as any[]).map((r) => ({ value: r.id, label: r.name }))} value={role} onChange={setRole} />
        <Input label="Lock to one email (optional)" autoCapitalize="none" value={email} onChangeText={setEmail} />
        <Input label="Expires after (days, blank = never)" keyboardType="numeric" value={days} onChangeText={setDays} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><T>Allow any email address</T><Switch value={any} onValueChange={setAny} /></View>
        <Input label="Note (who it's for)" value={note} onChangeText={setNote} />
        <Err msg={err} /><Btn title={busy ? 'Generating…' : 'Generate'} onPress={generate} disabled={busy} />
      </Card>
      {fresh.length > 0 && <Card style={{ borderColor: '#2E9E5B' }}>
        <T style={{ fontWeight: '700' }}>New codes</T>
        {fresh.map((c) => <View key={c.id} style={{ gap: 4 }}><T style={{ fontWeight: '800', fontSize: 18, letterSpacing: 1 }}>{c.code}</T><Btn title="Share / copy" kind="ghost" onPress={() => share(c)} /></View>)}
      </Card>}
      {msg ? <T>{msg}</T> : null}
      <H>All codes</H>
      <Chips options={['unused', 'used', 'expired'].map((v) => ({ value: v, label: v }))} value={filter} onChange={setFilter} />
      {list.length === 0 && <T muted>None.</T>}
      {list.map((c) => (
        <Card key={c.id}>
          <T style={{ fontWeight: '800', letterSpacing: 1 }}>{c.code}</T>
          <T muted>{status(c)}{c.roles?.name ? ` · ${c.roles.name}` : ''}{c.email ? ` · ${c.email}` : ''}{c.note ? ` · ${c.note}` : ''}</T>
          {c.used_at ? <T muted>Used by {c.profiles?.full_name || c.profiles?.email || 'a new player'} on {new Date(c.used_at).toLocaleDateString()}</T>
            : c.expires_at ? <T muted>Expires {new Date(c.expires_at).toLocaleDateString()}</T> : null}
          {!c.used_at && <><Btn title="Share / copy" kind="ghost" onPress={() => share(c)} /><Btn title="Revoke" kind="danger" onPress={() => revoke(c)} /></>}
        </Card>
      ))}
    </Screen>
  );
}
