import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Screen, H, T, Card, Btn, Input, Chips, Toggle, Err, Loading, Avatar } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { useTable } from '../../../lib/useQuery';
import { useApp } from '../../../lib/app-context';
import { RATINGS } from '../../../lib/development';

type Row = { rating: string | null; note: string; shared: boolean };
const EMPTY: Row = { rating: null, note: '', shared: false };

/** After the match: rate every player who played (1–10), add a short note, and choose whether the player can read it. */
export default function RateMatch() {
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const { can, session } = useApp(); const me = session?.user.id;
  const m = useTable('matches', (q) => q.eq('id', matchId).select('*, opponents(name)'), [matchId]);
  const squad = useTable('match_players', (q) => q.eq('match_id', matchId).select('player_id, started, players(full_name, shirt_number, photo_url)'), [matchId]);
  const mine = useTable('player_ratings', (q) => q.eq('match_id', matchId).eq('created_by', me ?? ''), [matchId, me]);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);

  useEffect(() => {
    const r: Record<string, Row> = {};
    (mine.data as any[]).forEach((x) => { r[x.player_id] = { rating: x.rating != null ? String(Math.round(Number(x.rating))) : null, note: x.note ?? '', shared: !!x.shared }; });
    setRows(r);
  }, [mine.data]);

  if (!can('development.manage')) return <Screen><T>No permission.</T></Screen>;
  if (m.loading || squad.loading || mine.loading) return <Loading />;
  const x: any = m.data[0];
  if (!x) return <Screen><T muted>Match not found.</T></Screen>;
  const set = (pid: string, patch: Partial<Row>) => setRows((s) => ({ ...s, [pid]: { ...(s[pid] ?? EMPTY), ...patch } }));
  const players = [...(squad.data as any[])].sort((a, b) => Number(b.started) - Number(a.started));

  const save = async () => {
    if (!me) return; setBusy(true); setErr(null); setMsg(null);
    try {
      const had = new Set((mine.data as any[]).map((r) => r.player_id));
      const up: any[] = []; const del: string[] = [];
      for (const p of players) {
        const r = rows[p.player_id] ?? EMPTY; const note = r.note.trim();
        if (r.rating == null && !note) { if (had.has(p.player_id)) del.push(p.player_id); continue; }
        up.push({ match_id: matchId, player_id: p.player_id, created_by: me, rating: r.rating != null ? Number(r.rating) : null, note: note || null, shared: r.shared });
      }
      if (up.length) { const { error } = await supabase.from('player_ratings').upsert(up, { onConflict: 'match_id,player_id,created_by' }); if (error) throw new Error(error.message); }
      for (const pid of del) { const { error } = await supabase.from('player_ratings').delete().eq('match_id', matchId).eq('player_id', pid).eq('created_by', me); if (error) throw new Error(error.message); }
      setMsg(`Saved ${up.length} rating${up.length === 1 ? '' : 's'}.`); await mine.refresh();
    } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <Screen>
      <H>Rate players: {x.opponents?.name}</H>
      <T muted>Final score {x.goals_for ?? 0} – {x.goals_against ?? 0}. Ratings are private to staff unless you switch on “Player can read this”.</T>
      {players.length === 0 ? <T muted>No squad recorded for this match. Add who played under Matches → Events & lineup.</T> : null}
      {players.map((p) => { const r = rows[p.player_id] ?? EMPTY; return (
        <Card key={p.player_id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Avatar url={p.players?.photo_url} name={p.players?.full_name} size={36} />
            <T style={{ fontWeight: '700', flex: 1 }}>{p.players?.shirt_number != null ? `#${p.players.shirt_number} ` : ''}{p.players?.full_name}{p.started ? '' : ' (sub)'}</T>
          </View>
          <Chips options={RATINGS} value={r.rating} onChange={(v) => set(p.player_id, { rating: v === r.rating ? null : v })} />
          <Input label="Note (optional)" value={r.note} onChangeText={(v) => set(p.player_id, { note: v })} maxLength={1000} multiline />
          <Toggle label="Player can read this" value={r.shared} onChange={(v) => set(p.player_id, { shared: v })} />
        </Card>); })}
      <Err msg={err} />{msg ? <T>{msg}</T> : null}
      <Btn title="Save ratings" disabled={busy || players.length === 0} onPress={save} />
    </Screen>
  );
}
