import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Screen, H, T, Card, Btn, Input, Chips, Toggle, Err, Loading, Avatar, fmtDate } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { useTable } from '../../../lib/useQuery';
import { useApp } from '../../../lib/app-context';
import { BadgeRow } from '../../../components/BadgeRow';
import { INJURY_STATUS, RATINGS, avg, statusLabel, useBadges } from '../../../lib/development';
import { DateTimeField } from '../../../components/DateTimeField';

/** One player: injuries and return to play, rating history, coach notes. Private to staff. */
export default function PlayerDevelopment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can } = useApp();
  const p = useTable('players', (q) => q.eq('id', id).select('id, full_name, shirt_number, photo_url, positions(name)'), [id]);
  const inj = useTable('player_injuries', (q) => q.eq('player_id', id).order('started_on', { ascending: false }), [id]);
  const rat = useTable('player_ratings', (q) => q.eq('player_id', id).order('created_at', { ascending: false }).limit(60).select('*, matches(kickoff_at, opponents(name))'), [id]);
  const badges = useBadges(id);
  const [inForm, setInForm] = useState({ description: '', status: 'out', expected: '', plan: '' });
  const [note, setNote] = useState(''); const [noteShared, setNoteShared] = useState(false); const [noteRating, setNoteRating] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  if (!can('development.manage')) return <Screen><T>No permission.</T></Screen>;
  if (p.loading || inj.loading || rat.loading) return <Loading />;
  const x: any = p.data[0];
  if (!x) return <Screen><T muted>Player not found.</T></Screen>;
  const go = async (fn: () => PromiseLike<{ error: any }>, after?: () => void) => { setBusy(true); setErr(null); const { error } = await fn(); setBusy(false); if (error) return setErr(error.message); after?.(); await Promise.all([inj.refresh(), rat.refresh()]); };

  const isDate = (v: string) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
  const addInjury = () => {
    if (!inForm.description.trim()) return setErr('Say briefly what the injury is.');
    if (!isDate(inForm.expected)) return setErr('Use a date like 2026-11-20 for the expected return.');
    return go(() => supabase.from('player_injuries').insert({ player_id: id, description: inForm.description.trim(), status: inForm.status, expected_return: inForm.expected || null, plan: inForm.plan.trim() || null }), () => setInForm({ description: '', status: 'out', expected: '', plan: '' }));
  };
  const setStatus = (iid: string, status: string) => go(() => supabase.from('player_injuries').update({ status }).eq('id', iid));
  const delInjury = (iid: string) => go(() => supabase.from('player_injuries').delete().eq('id', iid));
  const addNote = () => {
    if (!note.trim() && noteRating == null) return setErr('Write a note or choose a rating.');
    return go(() => supabase.from('player_ratings').insert({ player_id: id, match_id: null, rating: noteRating ? Number(noteRating) : null, note: note.trim() || null, shared: noteShared }), () => { setNote(''); setNoteShared(false); setNoteRating(null); });
  };
  const delRating = (rid: string) => go(() => supabase.from('player_ratings').delete().eq('id', rid));
  const shareToggle = (rid: string, v: boolean) => go(() => supabase.from('player_ratings').update({ shared: v }).eq('id', rid));
  const matchRatings = (rat.data as any[]).filter((r) => r.match_id && r.rating != null).map((r) => Number(r.rating));

  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Avatar url={x.photo_url} name={x.full_name} size={56} />
        <View style={{ flex: 1 }}><H>{x.full_name}</H><T muted>{[x.shirt_number != null ? `#${x.shirt_number}` : null, x.positions?.name].filter(Boolean).join(' · ')}</T></View>
      </View>
      <BadgeRow badges={badges} />
      <Err msg={err} />

      <H>Injuries & return to play</H>
      {(inj.data as any[]).length === 0 ? <T muted>No injuries recorded.</T> : (inj.data as any[]).map((i) => (
        <Card key={i.id}>
          <T style={{ fontWeight: '800' }}>{i.description}</T>
          <T muted>{statusLabel(i.status)} · from {i.started_on}{i.expected_return && i.status !== 'cleared' ? ` · back around ${i.expected_return}` : ''}{i.cleared_on ? ` · cleared ${i.cleared_on}` : ''}</T>
          {i.plan ? <T>{i.plan}</T> : null}
          <Chips options={INJURY_STATUS} value={i.status} onChange={(v) => v !== i.status && setStatus(i.id, v)} />
          <Btn title="Delete record" kind="danger" disabled={busy} onPress={() => delInjury(i.id)} />
        </Card>))}
      <Card>
        <T style={{ fontWeight: '700' }}>New injury</T>
        <Input label="What happened? (keep it brief)" value={inForm.description} onChangeText={(v) => setInForm({ ...inForm, description: v })} maxLength={300} />
        <Chips options={INJURY_STATUS.filter((s) => s.value !== 'cleared')} value={inForm.status} onChange={(v) => setInForm({ ...inForm, status: v })} />
        <DateTimeField mode="date" optional label="Expected back" value={inForm.expected || null} onChange={(v) => setInForm({ ...inForm, expected: v ?? '' })} />
        <Input label="Return-to-play steps (optional)" value={inForm.plan} onChangeText={(v) => setInForm({ ...inForm, plan: v })} multiline maxLength={1000} />
        <T muted style={{ fontSize: 12 }}>Only staff with development access and this player can see injury records. Follow your club's medical and safeguarding policy; this is a tracker, not medical advice.</T>
        <Btn title="Add injury" disabled={busy} onPress={addInjury} />
      </Card>

      <H>Ratings & notes</H>
      <T muted>{matchRatings.length ? `Average ${avg(matchRatings)} over ${matchRatings.length} rated match${matchRatings.length === 1 ? '' : 'es'}` : 'No match ratings yet. Rate a whole squad from the match report screen.'}</T>
      <Card>
        <T style={{ fontWeight: '700' }}>Add a general note</T>
        <Chips options={RATINGS} value={noteRating} onChange={(v) => setNoteRating(v === noteRating ? null : v)} />
        <Input label="Note" value={note} onChangeText={setNote} multiline maxLength={1000} />
        <Toggle label="Player can read this" value={noteShared} onChange={setNoteShared} />
        <Btn title="Save note" disabled={busy} onPress={addNote} />
      </Card>
      {(rat.data as any[]).map((r) => (
        <Card key={r.id}>
          <T style={{ fontWeight: '700' }}>{r.rating != null ? `${Number(r.rating)}/10 · ` : ''}{r.matches ? `vs ${r.matches.opponents?.name}` : 'General note'}</T>
          <T muted>{fmtDate(r.matches?.kickoff_at ?? r.created_at)}</T>
          {r.note ? <T>{r.note}</T> : null}
          <Toggle label="Player can read this" value={r.shared} onChange={(v) => shareToggle(r.id, v)} />
          <Btn title="Delete" kind="danger" disabled={busy} onPress={() => delRating(r.id)} />
        </Card>))}
    </Screen>
  );
}
