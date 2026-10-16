import { useState } from 'react';
import { useLocalSearchParams, Link } from 'expo-router';
import { View } from 'react-native';
import { Screen, H, T, Card, Btn, Input, Chips, Err, Loading } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { useTable } from '../../../lib/useQuery';
import { useApp } from '../../../lib/app-context';
import { matchTitle, useLiveMatch, clockDisplay, currentMinute, useTick, useNow, useAutoClock, countdownText, autoTick, eventIcon, KIND_ICON } from '../../../lib/matchday';

const KINDS = [{ value: 'comment', label: '💬 Comment' }, { value: 'chance', label: '❗ Chance' }, { value: 'sub', label: '🔁 Substitution' }];

/** One-thumb match-day console for staff: clock buttons, quick goals and cards, commentary. */
export default function LiveConsole() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { can, settings } = useApp();
  const { match: m, events, commentary, loading, refresh } = useLiveMatch(id, true);
  const players = useTable('players', (q) => q.eq('is_active', true).order('shirt_number'));
  const types = useTable('event_types', (q) => q.order('sort_order'));
  const squad = useTable('match_players', (q) => q.eq('match_id', id), [id]);
  const [who, setWho] = useState<string | null>(null);
  const [assist, setAssist] = useState<string | null>(null);
  const [text, setText] = useState(''); const [kind, setKind] = useState('comment');
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const [side, setSide] = useState<'us' | 'opp'>('us'); const [minuteText, setMinuteText] = useState('');
  useTick(m?.status === 'live', 1000); useAutoClock(m, refresh, Number(settings.half_time_minutes ?? 15) || 15);
  const now = useNow(m?.status === 'scheduled');
  if (!can('matches.manage')) return <Screen><T>No permission.</T></Screen>;
  if (loading || players.loading || types.loading) return <Loading />;
  if (!m) return <Screen><T muted>Match not found.</T></Screen>;

  const inSquad = (squad.data as any[]).map((r) => r.player_id);
  const pool = (players.data as any[]).filter((p) => inSquad.length === 0 || inSquad.includes(p.id));
  const opts = pool.map((p) => ({ value: p.id, label: `${p.shirt_number != null ? '#' + p.shirt_number + ' ' : ''}${p.full_name}` }));
  const typeId = (key: string) => (types.data as any[]).find((t) => t.stat_key === key)?.id as string | undefined;

  const run = async (fn: () => PromiseLike<{ error: any }>) => {
    setBusy(true); setErr(null);
    const { error } = await fn(); setBusy(false);
    if (error) return setErr(error.message);
    await refresh();
  };
  const setPeriod = (p: string) => run(() => supabase.rpc('match_set_period', { p_match: id, p_period: p }));
  const isCard = (k: string) => k === 'yellow_card' || k === 'red_card';
  const addEvent = async (key: string) => {
    const t = typeId(key); if (!t) return setErr(key === 'yellow_card' ? 'The Yellow card event type is missing. Add it under Event types.' : key === 'red_card' ? 'The Red card event type is missing. Add it under Event types.' : 'That event type is missing. Add it under Event types.');
    const opp = isCard(key) && side === 'opp';
    if ((key === 'goal' || (isCard(key) && !opp)) && !who) return setErr('Pick the player first (or choose Opponent for a card to the other team).');
    const typed = minuteText.trim() !== '' ? Number(minuteText) : null;
    if (typed != null && (!Number.isFinite(typed) || typed < 0 || typed > 130)) return setErr('Minute must be a number between 0 and 130.');
    const minute = typed ?? currentMinute(m);
    await run(() => supabase.from('match_events').insert({ match_id: id, event_type_id: t, player_id: key === 'goal_against' || opp ? null : who, related_player_id: key === 'goal' ? assist : null, minute, notes: opp ? 'Opponent player' : null }));
    setWho(null); setAssist(null); setMinuteText('');
  };
  const setAdded = (n: number) => run(() => supabase.rpc('match_set_added_time', { p_match: id, p_minutes: n }));
  const toggleAuto = () => run(() => supabase.rpc('match_set_auto', { p_match: id, p_on: m.auto_clock === false }));
  const say = async () => {
    if (!text.trim()) return;
    await run(() => supabase.from('match_commentary').insert({ match_id: id, minute: currentMinute(m), kind, body: text.trim().slice(0, 400) }));
    setText('');
  };
  const delLine = (cid: string) => run(() => supabase.from('match_commentary').delete().eq('id', cid));
  const delEvent = (eid: string) => run(() => supabase.from('match_events').delete().eq('id', eid));
  const live = m.status === 'live';

  return (
    <Screen>
      <H>Live: {matchTitle(m, settings.team_name)}</H>
      <Card>
        <T style={{ fontSize: 34, fontWeight: '900' }}>{m.goals_for ?? 0} – {m.goals_against ?? 0}</T>
        <T muted>{m.status === 'scheduled' ? `Not started${m.auto_clock !== false ? ` · kicks off automatically in ${countdownText(m.kickoff_at, now)}` : ''}` : m.status === 'finished' ? 'Full time' : `Clock ${clockDisplay(m) || '—'}`} · fans see this as it happens</T>
        {m.status !== 'finished' ? <Btn title={m.auto_clock === false ? 'Automatic clock: OFF (tap to turn on)' : 'Automatic clock: ON (tap to turn off)'} kind="ghost" disabled={busy} onPress={toggleAuto} /> : null}
        {m.status === 'scheduled' ? <Btn title={m.auto_clock === false ? 'Kick off' : 'Kick off now (instead of waiting)'} disabled={busy} onPress={() => setPeriod('first_half')} /> : null}
        {m.status === 'scheduled' && m.auto_clock !== false && new Date(m.kickoff_at).getTime() <= now ? <Btn title="Start automatic clock now" kind="ghost" disabled={busy} onPress={async () => { await autoTick(); await refresh(); }} /> : null}
        {m.period === 'first_half' ? <Btn title="Half time (early)" kind="ghost" disabled={busy} onPress={() => setPeriod('half_time')} /> : null}
        {m.period === 'half_time' ? <Btn title="Start second half" disabled={busy} onPress={() => setPeriod('second_half')} /> : null}
        {m.period === 'second_half' ? <Btn title="Full time (early)" kind="danger" disabled={busy} onPress={() => setPeriod('full_time')} /> : null}
        {m.period === 'first_half' || m.period === 'second_half' ? (<>
          <T muted>Added time this half: {m.period === 'first_half' ? m.first_half_added : m.second_half_added} min. The half ends by itself at {m.period === 'first_half' ? '45' : '90'} + added time.</T>
          <Chips options={[0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: `+${n}` }))} value={String(m.period === 'first_half' ? m.first_half_added : m.second_half_added)} onChange={(v) => v != null && setAdded(Number(v))} />
        </>) : null}
        {m.status === 'finished' ? <Link href={`/admin/match-report/${id}` as any}><T style={{ fontWeight: '700', textDecorationLine: 'underline' }}>Write the match report & Man of the Match →</T></Link> : null}
      </Card>
      <Err msg={err} />
      {m.status !== 'scheduled' ? (<>
        <Card>
          <T style={{ fontWeight: '800' }}>Quick event</T>
          <T muted>Cards: choose Us or Opponent. The minute fills in from the clock — type one to add an event after the fact.</T>
          <Chips options={[{ value: 'us', label: 'Our team' }, { value: 'opp', label: 'Opponent (cards)' }]} value={side} onChange={(v) => setSide((v as any) ?? 'us')} />
          <Input label="Minute (optional)" keyboardType="numeric" value={minuteText} onChangeText={setMinuteText} />
          <T muted>Player</T><Chips options={opts} value={who} onChange={setWho} />
          <T muted>Assist (goals only, optional)</T><Chips options={opts} value={assist} onChange={setAssist} />
          <View style={{ gap: 8 }}>
            <Btn title="⚽ Goal for us" disabled={busy} onPress={() => addEvent('goal')} />
            <Btn title="Goal against us" kind="ghost" disabled={busy} onPress={() => addEvent('goal_against')} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1 }}><Btn title="🟨 Yellow" kind="ghost" disabled={busy} onPress={() => addEvent('yellow_card')} /></View>
              <View style={{ flex: 1 }}><Btn title="🟥 Red" kind="danger" disabled={busy} onPress={() => addEvent('red_card')} /></View>
            </View>
          </View>
        </Card>
        <Card>
          <T style={{ fontWeight: '800' }}>Commentary</T>
          <Chips options={KINDS} value={kind} onChange={setKind} />
          <Input label="What just happened?" value={text} onChangeText={setText} maxLength={400} multiline />
          <Btn title="Post" disabled={busy || !text.trim()} onPress={say} />
        </Card>
      </>) : null}
      <H>Feed</H>
      {commentary.length === 0 ? <T muted>Nothing yet.</T> : commentary.map((x) => (
        <Card key={x.id} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <T style={{ width: 36 }} muted>{x.minute != null ? `${x.minute}′` : ''}</T><T>{KIND_ICON[x.kind] ?? '💬'}</T><T style={{ flex: 1 }}>{x.body}</T>
          <Btn title="✕" kind="ghost" onPress={() => delLine(x.id)} />
        </Card>))}
      {(events as any[]).length ? <><H>Events</H>{(events as any[]).map((e) => (
        <Card key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <T style={{ flex: 1 }}>{eventIcon(e)} {e.minute != null ? `${e.minute}′ ` : ''}{e.event_types?.label}{e.player?.full_name ? ` · ${e.player.full_name}` : e.notes ? ` · ${e.notes}` : ''}</T>
          <Btn title="Delete" kind="danger" onPress={() => delEvent(e.id)} />
        </Card>))}</> : null}
    </Screen>
  );
}
