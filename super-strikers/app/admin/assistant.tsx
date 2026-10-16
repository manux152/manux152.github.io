import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, H, T, Card, Btn, Input, Chips, Toggle, Err } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';

const LIMITS = [{ value: '15', label: '15 / hour' }, { value: '40', label: '40 / hour' }, { value: '100', label: '100 / hour' }];
const ZONES = ['UTC', 'Africa/Kampala', 'Africa/Nairobi', 'Africa/Lagos', 'Europe/London', 'America/Chicago', 'America/New_York'];
const str = (v: any) => (typeof v === 'string' ? v : '');

// Admin → Team assistant: switch it on or off, name it, teach it club rules, choose the suggested questions.
export default function AssistantAdmin() {
  const { can, settings, reload } = useApp(); const router = useRouter();
  const [on, setOn] = useState(settings.assistant_enabled !== false && settings.assistant_enabled !== 'false');
  const [guests, setGuests] = useState(settings.assistant_guests !== false && settings.assistant_guests !== 'false');
  const [name, setName] = useState(str(settings.assistant_name) || 'Team Assistant'); const [welcome, setWelcome] = useState(str(settings.assistant_welcome));
  const [notes, setNotes] = useState(str(settings.assistant_notes)); const [tz, setTz] = useState(str(settings.assistant_timezone) || 'UTC');
  const [limit, setLimit] = useState(String(settings.assistant_hourly_limit ?? 40));
  const [qs, setQs] = useState<string[]>(Array.isArray(settings.assistant_questions) ? settings.assistant_questions : []);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [msg, setMsg] = useState<string | null>(null); const [status, setStatus] = useState<string | null>(null);
  if (!can('settings.manage')) return <Screen><T>No permission.</T></Screen>;

  const check = async () => {
    setStatus('Checking…');
    const { data, error } = await supabase.functions.invoke('team-assistant', { body: { mode: 'status' } });
    if (error || !data?.ok) return setStatus('The assistant function is not reachable. Deploy it with: supabase functions deploy team-assistant');
    setStatus(data.ai ? '✓ Connected. AI answers are on.' : '✓ Connected, but no AI key is set, so it answers from your data with plain templates. Add one with: supabase secrets set ANTHROPIC_API_KEY=…');
  };
  const save = async () => {
    setErr(null); setMsg(null);
    try { Intl.DateTimeFormat('en-GB', { timeZone: tz.trim() || 'UTC' }); } catch { return setErr('That time zone is not valid. Use a name like Africa/Kampala or UTC.'); }
    if (!name.trim()) return setErr('Give the assistant a name.');
    setBusy(true);
    const rows = [{ key: 'assistant_enabled', value: on }, { key: 'assistant_guests', value: guests }, { key: 'assistant_name', value: name.trim() }, { key: 'assistant_welcome', value: welcome.trim() },
      { key: 'assistant_notes', value: notes.trim() }, { key: 'assistant_timezone', value: tz.trim() || 'UTC' }, { key: 'assistant_hourly_limit', value: Number(limit) },
      { key: 'assistant_questions', value: qs.map((q) => q.trim()).filter(Boolean).slice(0, 8) }];
    const { error } = await supabase.from('site_settings').upsert(rows, { onConflict: 'key' });
    setBusy(false); if (error) return setErr(error.message);
    await reload(); setMsg('Saved.');
  };
  return (
    <Screen>
      <H>Team assistant</H>
      <T muted>A chat helper that answers questions about the app and about what is happening at the club: matches, friendlies, training, events, tryouts, news, squad, stats, shop and offers. It only sees what the person asking is allowed to see (visitors: public information; signed-in members: also their own orders and team-only items such as training).</T>
      <Card>
        <Toggle label="Assistant is on" hint="Turns off the chat button everywhere." value={on} onChange={setOn} />
        <Toggle label="Visitors who are not signed in can use it" hint="They get public information only." value={guests} onChange={setGuests} />
        <Btn title="Check the connection" kind="ghost" onPress={check} />
        {status ? <T muted style={{ fontSize: 13 }}>{status}</T> : null}
        <Btn title="Open the assistant" kind="ghost" onPress={() => router.push('/assistant' as any)} />
      </Card>
      <Card>
        <Input label="Name" value={name} onChangeText={setName} />
        <Input label="Welcome message" multiline value={welcome} onChangeText={setWelcome} />
        <Input label="Time zone for dates and times (e.g. Africa/Kampala)" autoCapitalize="none" value={tz} onChangeText={setTz} />
        <Chips options={ZONES.map((z) => ({ value: z, label: z }))} value={ZONES.includes(tz) ? tz : null} onChange={(v) => v && setTz(v)} />
      </Card>
      <Card>
        <T style={{ fontWeight: '800' }}>Club notes (it treats these as official)</T>
        <T muted style={{ fontSize: 12 }}>Anything the system does not store: membership fees, kit rules, pick-up points, who to call, ground rules, FAQs. One topic per line works well.</T>
        <Input multiline value={notes} onChangeText={setNotes} placeholder={'Training is at Magamaga Ground, bring water and shin guards.\nMembership fee is 10,000 UGX per term.'} style={{ minHeight: 140 }} />
      </Card>
      <Card>
        <T style={{ fontWeight: '800' }}>Suggested questions (up to 8)</T>
        {qs.map((q, i) => (
          <View key={i} style={{ gap: 6 }}>
            <Input value={q} onChangeText={(v) => setQs(qs.map((x, j) => (j === i ? v : x)))} />
            <Btn title="Remove" kind="ghost" onPress={() => setQs(qs.filter((_, j) => j !== i))} />
          </View>))}
        {qs.length < 8 ? <Btn title="+ Add a question" kind="ghost" onPress={() => setQs([...qs, ''])} /> : null}
      </Card>
      <Card>
        <T style={{ fontWeight: '800' }}>Fair use</T>
        <T muted style={{ fontSize: 12 }}>Questions each signed-in person can ask per hour (visitors get half). Question text is never stored; only counts are kept for 2 days.</T>
        <Chips options={LIMITS} value={LIMITS.some((l) => l.value === limit) ? limit : null} onChange={(v) => v && setLimit(v)} />
      </Card>
      <Err msg={err} />{msg ? <T style={{ fontWeight: '700' }}>{msg}</T> : null}
      <Btn title={busy ? 'Saving…' : 'Save assistant settings'} onPress={save} disabled={busy} />
    </Screen>
  );
}
