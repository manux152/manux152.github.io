import { useState } from 'react';
import { useLocalSearchParams, Link } from 'expo-router';
import { View } from 'react-native';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { useTable } from '../../../lib/useQuery';
import { useApp } from '../../../lib/app-context';
import { eventIcon, matchTitle } from '../../../lib/matchday';

export default function MatchEvents() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can, settings } = useApp();
  const m = useTable('matches', (q) => q.eq('id', id).select('*, opponents(name)'), [id]);
  const players = useTable('players', (q) => q.eq('is_active', true).order('shirt_number'));
  const types = useTable('event_types', (q) => q.order('sort_order'));
  const ev = useTable('match_events', (q) => q.eq('match_id', id).order('minute').select('*, event_types(label,stat_key), player:players!match_events_player_id_fkey(full_name), assist:players!match_events_related_player_id_fkey(full_name)'), [id]);
  const lu = useTable('match_players', (q) => q.eq('match_id', id), [id]);
  const [form, setForm] = useState<{ type: string | null; player: string | null; assist: string | null; minute: string; notes: string }>({ type: null, player: null, assist: null, minute: '', notes: '' });
  const [err, setErr] = useState<string | null>(null);
  const [pmsg, setPmsg] = useState<string | null>(null);
  const [card, setCard] = useState<{ player: string | null; opp: boolean; minute: string }>({ player: null, opp: false, minute: '' });
  if (!can('matches.manage')) return <Screen><T>No permission.</T></Screen>;
  if (m.loading || players.loading || types.loading) return <Loading />;
  const x: any = m.data[0];
  const pOpts = (players.data as any[]).map((p) => ({ value: p.id, label: `${p.shirt_number != null ? '#' + p.shirt_number + ' ' : ''}${p.full_name}` }));
  const inSquad = (lu.data as any[]).map((r) => r.player_id);
  const selType: any = (types.data as any[]).find((t) => t.id === form.type);

  const setSquad = async (next: string[]) => {
    const add = next.filter((p) => !inSquad.includes(p)), rem = inSquad.filter((p) => !next.includes(p));
    if (add.length) await supabase.from('match_players').insert(add.map((player_id) => ({ match_id: id, player_id })));
    for (const p of rem) await supabase.from('match_players').delete().eq('match_id', id).eq('player_id', p);
    await lu.refresh();
  };
  const addEvent = async () => {
    if (!form.type) return setErr('Choose an event type');
    const { error } = await supabase.from('match_events').insert({
      match_id: id, event_type_id: form.type, player_id: form.player, related_player_id: selType?.stat_key === 'goal' ? form.assist : null,
      minute: form.minute ? Number(form.minute) : null, notes: form.notes || null });
    if (error) return setErr(error.message);
    setErr(null); setForm({ type: null, player: null, assist: null, minute: '', notes: '' });
    await ev.refresh(); await m.refresh();
  };
  const addCard = async (key: 'yellow_card' | 'red_card') => {
    const t = (types.data as any[]).find((x) => x.stat_key === key)?.id; if (!t) return setErr(`The ${key === 'yellow_card' ? 'Yellow' : 'Red'} card event type is missing. Add it under Event types.`);
    if (!card.player && !card.opp) return setErr('Pick the player who was carded, or choose Opponent.');
    const minute = card.minute.trim() === '' ? null : Number(card.minute);
    if (minute != null && (!Number.isFinite(minute) || minute < 0 || minute > 130)) return setErr('Minute must be a number between 0 and 130.');
    const { error } = await supabase.from('match_events').insert({ match_id: id, event_type_id: t, player_id: card.opp ? null : card.player, minute, notes: card.opp ? 'Opponent player' : null });
    if (error) return setErr(error.message);
    setErr(null); setCard({ player: null, opp: false, minute: '' }); await ev.refresh();
  };
  const predict = async () => {
    setPmsg(null); setErr(null);
    const { data, error } = await supabase.functions.invoke('predict-match', { body: { match_id: id } });
    if (error || data?.error) return setErr(data?.error ?? error?.message ?? 'Prediction failed');
    const p = data.predictions[0]; setPmsg(`Win ${p.win_pct}% · Draw ${p.draw_pct}% · Loss ${p.loss_pct}% (${p.confidence} confidence)`);
  };
  const delEvent = async (eid: string) => { await supabase.from('match_events').delete().eq('id', eid); await ev.refresh(); await m.refresh(); };

  return (
    <Screen>
      <H>{x ? matchTitle(x, settings.team_name) : 'Match'}</H>
      <T muted>Score: {x?.goals_for ?? '–'} – {x?.goals_against ?? '–'} (updates automatically from goal events)</T>
      <Link href={`/admin/live/${id}` as any} asChild><Btn title={x?.status === 'finished' ? 'Open live console' : 'Go to live console (kick-off, goals, commentary)'} onPress={() => {}} /></Link>
      {can('video.manage') ? <Link href={`/admin/video/${id}` as any} asChild><Btn title="Match video: tag clips and highlights" kind="ghost" onPress={() => {}} /></Link> : null}
      {x?.status === 'finished' ? <Link href={`/admin/match-report/${id}` as any} asChild><Btn title="Match report & Man of the Match" kind="ghost" onPress={() => {}} /></Link> : null}
      {x?.status === 'scheduled' && <Card><T style={{ fontWeight: '700' }}>Prediction</T><T muted>Estimates win / draw / loss from results and league tables, and shows it to fans.</T>
        {pmsg ? <T>{pmsg}</T> : null}<Btn title="Generate / refresh prediction" kind="ghost" onPress={predict} /></Card>}
      <Card><T style={{ fontWeight: '700' }}>Squad who played</T>
        <Chips multi options={pOpts} value={inSquad} onChange={setSquad} /></Card>
      <Card><T style={{ fontWeight: '700' }}>🟨 🟥 Cards</T>
        <T muted>Quick yellow and red cards. A second yellow to the same player adds a red card automatically.</T>
        <Chips options={[{ value: 'us', label: 'Our player' }, { value: 'opp', label: 'Opponent' }]} value={card.opp ? 'opp' : 'us'} onChange={(v) => setCard({ ...card, opp: v === 'opp', player: v === 'opp' ? null : card.player })} />
        {!card.opp ? <Chips options={pOpts} value={card.player} onChange={(v) => setCard({ ...card, player: v })} /> : null}
        <Input label="Minute" keyboardType="numeric" value={card.minute} onChangeText={(v) => setCard({ ...card, minute: v })} />
        <Err msg={err} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Btn title="🟨 Yellow card" kind="ghost" onPress={() => addCard('yellow_card')} /></View>
          <View style={{ flex: 1 }}><Btn title="🟥 Red card" kind="danger" onPress={() => addCard('red_card')} /></View>
        </View></Card>
      <Card><T style={{ fontWeight: '700' }}>Add event</T>
        <Chips options={(types.data as any[]).map((t) => ({ value: t.id, label: t.label }))} value={form.type} onChange={(v) => setForm({ ...form, type: v })} />
        <T muted>Player</T><Chips options={pOpts} value={form.player} onChange={(v) => setForm({ ...form, player: v })} />
        {selType?.stat_key === 'goal' && (<><T muted>Assist (optional)</T><Chips options={pOpts} value={form.assist} onChange={(v) => setForm({ ...form, assist: v })} /></>)}
        <Input label="Minute" keyboardType="numeric" value={form.minute} onChangeText={(v) => setForm({ ...form, minute: v })} />
        <Input label="Notes" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} />
        <Err msg={err} /><Btn title="Add event" onPress={addEvent} /></Card>
      <H>Events</H>
      {ev.data.length === 0 && <T muted>None yet.</T>}
      {(ev.data as any[]).map((e) => (
        <Card key={e.id}><View style={{ gap: 4 }}>
          <T style={{ fontWeight: '700' }}>{eventIcon(e)} {e.minute != null ? `${e.minute}' ` : ''}{e.event_types?.label}{e.player?.full_name ? ` · ${e.player.full_name}` : e.notes ? ` · ${e.notes}` : ''}</T>
          {e.assist?.full_name ? <T muted>Assist: {e.assist.full_name}</T> : null}
          <Btn title="Delete" kind="danger" onPress={() => delEvent(e.id)} />
        </View></Card>
      ))}
    </Screen>
  );
}
