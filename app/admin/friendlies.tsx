import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Screen, H, T, Card, Btn, Input, Chips, Err } from '../../components/ui';
import { DateTimeField } from '../../components/DateTimeField';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../lib/app-context';

const FILTERS = [{ value: 'pending', label: 'Waiting' }, { value: 'accepted', label: 'Accepted' }, { value: 'declined', label: 'Declined' }, { value: 'all', label: 'All' }];
const VENUE: Record<string, string> = { either: 'Either ground', our_ground: 'Would like to play at our ground', their_ground: 'Would like to play at their ground' };
const day = (d?: string | null) => (d ? new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '');

// Admin → Friendly requests: teams that asked for a friendly match. Accepting creates the opponent (with their logo) and a "Friendly" fixture,
// and e-mails the team. Declining e-mails them too. Reminders for the match then go out automatically.
export default function Friendlies() {
  const { can } = useApp();
  const [rows, setRows] = useState<any[]>([]); const [status, setStatus] = useState('pending');
  const [open, setOpen] = useState<string | null>(null); const [mode, setMode] = useState<'accept' | 'decline'>('accept');
  const [kick, setKick] = useState<string | null>(null); const [venue, setVenue] = useState(''); const [home, setHome] = useState('home'); const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null); const [ok, setOk] = useState<string | null>(null);
  const load = async () => { const { data } = await supabase.from('friendly_requests').select('*').order('created_at', { ascending: false }).limit(300); setRows(data ?? []); };
  useEffect(() => { load(); }, []);
  if (!can('matches.manage')) return <Screen><T>No permission.</T></Screen>;

  const n = (s: string) => rows.filter((r) => r.status === s).length;
  const shown = rows.filter((r) => status === 'all' || r.status === status);
  const start = (r: any, m: 'accept' | 'decline') => {
    setErr(null); setOk(null); setOpen(r.id); setMode(m); setNote('');
    setKick(r.date_option_1 ? new Date(r.date_option_1 + 'T10:00:00').toISOString() : null);   // starts on the day they asked for, 10:00 your time
    setHome(r.venue_pref === 'their_ground' ? 'home' : r.venue_pref === 'our_ground' ? 'away' : 'home');
    setVenue('');
  };
  const accept = async (r: any) => {
    setErr(null);
    if (!kick) return setErr('Choose the kick-off date and time.');
    setBusy(true);
    const { error } = await supabase.rpc('friendly_accept', { p_id: r.id, p_kickoff: kick, p_venue: venue.trim() || null, p_is_home: home === 'home', p_note: note.trim() || null });
    setBusy(false);
    if (error) return setErr(error.message);
    setOpen(null); setOk(`Friendly with ${r.team_name} added to the fixtures. They have been emailed.`); load();
  };
  const decline = async (r: any) => {
    setErr(null); setBusy(true);
    const { error } = await supabase.rpc('friendly_decline', { p_id: r.id, p_note: note.trim() || null });
    setBusy(false);
    if (error) return setErr(error.message);
    setOpen(null); setOk(`${r.team_name} has been told we can't fit a friendly in.`); load();
  };

  return (
    <Screen>
      <H>Friendly requests</H>
      <T muted>{n('pending')} waiting · {n('accepted')} accepted · {n('declined')} declined. Teams ask from the “Request a friendly” link on the website.</T>
      <Chips options={FILTERS} value={status} onChange={(v: string | null) => setStatus(v ?? 'pending')} />
      {ok ? <T>{ok}</T> : null}
      {shown.length === 0 ? <T muted>Nothing here yet.</T> : shown.map((r) => (
        <Card key={r.id}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <View style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: '#E6E8EC', overflow: 'hidden' }}>
              <Image source={{ uri: r.logo_url }} accessibilityLabel={`${r.team_name} logo`} style={{ width: 64, height: 64 }} contentFit="contain" />
            </View>
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '800', fontSize: 16 }}>{r.team_name}</T>
              <T muted style={{ fontSize: 12 }}>{r.age_group ? `${r.age_group} · ` : ''}asked {new Date(r.created_at).toLocaleDateString()} · {r.status}</T>
            </View>
          </View>
          <T>Wants to play on <T style={{ fontWeight: '700' }}>{day(r.date_option_1)}</T>{r.date_option_2 ? ` (or ${day(r.date_option_2)})` : ''}{r.time_note ? ` · ${r.time_note}` : ''}</T>
          <T muted>{VENUE[r.venue_pref] ?? ''}</T>
          <T>{r.contact_name} · <T style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(`mailto:${r.contact_email}`)}>{r.contact_email}</T>{r.contact_phone ? ` · ${r.contact_phone}` : ''}</T>
          {r.message ? <T>“{r.message}”</T> : null}
          {r.admin_note ? <T muted>Your note: {r.admin_note}</T> : null}
          {r.status === 'accepted' && r.match_id ? <Link href={`/match/${r.match_id}` as any}><T style={{ fontWeight: '700' }}>Open the match →</T></Link> : null}

          {r.status === 'pending' && open !== r.id ? (
            <View style={{ gap: 8 }}><Btn title="Accept and schedule the match" onPress={() => start(r, 'accept')} /><Btn title="Decline" kind="ghost" onPress={() => start(r, 'decline')} /></View>
          ) : null}

          {open === r.id && mode === 'accept' ? (
            <View style={{ gap: 10 }}>
              <DateTimeField label="Kick-off" mode="datetime" value={kick} onChange={setKick} />
              <Input label="Venue (optional)" value={venue} onChangeText={setVenue} />
              <T style={{ fontWeight: '700' }}>Is it a home or away game for us?</T>
              <Chips options={[{ value: 'home', label: 'Home' }, { value: 'away', label: 'Away' }]} value={home} onChange={(v: string | null) => setHome(v ?? 'home')} />
              <Input label="Message to them (optional, goes in the email)" multiline value={note} onChangeText={setNote} />
              <Err msg={err} />
              <Btn title={busy ? 'Saving…' : 'Confirm friendly and email them'} onPress={() => accept(r)} disabled={busy} />
              <Btn title="Cancel" kind="ghost" onPress={() => setOpen(null)} />
            </View>
          ) : null}
          {open === r.id && mode === 'decline' ? (
            <View style={{ gap: 10 }}>
              <Input label="Reason (optional, goes in the email)" multiline value={note} onChangeText={setNote} />
              <Err msg={err} />
              <Btn title={busy ? 'Saving…' : 'Decline and email them'} kind="danger" onPress={() => decline(r)} disabled={busy} />
              <Btn title="Cancel" kind="ghost" onPress={() => setOpen(null)} />
            </View>
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}
