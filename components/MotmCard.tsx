import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { T, Card, Avatar, Err, useColor } from './ui';
import { useApp } from '../lib/app-context';
import { motmTally, myMotmVote, castMotmVote } from '../lib/matchday';
import { supabase } from '../lib/supabase';

/**
 * Fans (signed-in members) vote for Man of the Match after full time.
 * Totals show once you have voted, and for everyone when voting closes. Nobody can see who voted for whom.
 */
export function MotmCard({ match, players }: { match: any; players: any[] }) {
  const { session, settings } = useApp(); const c = useColor();
  const me = session?.user?.id ?? null;
  const [mine, setMine] = useState<string | null>(null);
  const [tally, setTally] = useState<Record<string, number>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [winner, setWinner] = useState<any>(null);

  const hours = Number(settings.motm_window_hours ?? 48) || 48;
  const base = new Date(match.period_started_at ?? match.kickoff_at).getTime();
  const open = settings.motm_enabled !== false && match.status === 'finished' && !match.motm_player_id && Date.now() < base + hours * 3600000;

  const load = useCallback(async () => {
    setTally(await motmTally(match.id));
    if (me) setMine(await myMotmVote(match.id, me));
    if (match.motm_player_id) { const { data } = await supabase.from('players').select('id,full_name,photo_url,shirt_number').eq('id', match.motm_player_id).maybeSingle(); setWinner(data); }
  }, [match.id, match.motm_player_id, me]);
  useEffect(() => { load(); }, [load]);

  if (settings.motm_enabled === false || match.status !== 'finished') return null;
  const total = Object.values(tally).reduce((a, b) => a + b, 0);
  const showTally = !open || !!mine;
  const vote = async (pid: string) => {
    if (!me || busy) return; setBusy(true); setErr(null);
    try { await castMotmVote(match.id, me, pid); setMine(pid); setTally(await motmTally(match.id)); } catch (e: any) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <Card>
      <T style={{ fontWeight: '800', fontSize: 17 }}>⭐ Man of the Match</T>
      {winner ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar url={winner.photo_url} name={winner.full_name} size={56} />
          <View><T style={{ fontWeight: '800', fontSize: 18 }}>{winner.full_name}</T><T muted>Voted Man of the Match{total ? ` · ${total} vote${total === 1 ? '' : 's'}` : ''}</T></View>
        </View>
      ) : !open ? <T muted>Voting is closed{total ? '. Results below.' : ' and nobody voted.'}</T>
        : !me ? <T muted>Sign in to vote for your Man of the Match.</T>
        : <T muted>{mine ? 'Thanks for voting! You can change your vote until voting closes.' : 'Tap a player to vote.'}</T>}
      {!winner && (open || total > 0) ? players.map((p) => {
        const n = tally[p.player_id] ?? 0; const pct = showTally && total ? Math.round((n / total) * 100) : 0; const picked = mine === p.player_id;
        return (
          <Pressable key={p.player_id} disabled={!open || !me || busy} onPress={() => vote(p.player_id)} accessibilityRole="button"
            accessibilityLabel={`${open ? 'Vote for ' : ''}${p.players?.full_name}${showTally ? `, ${pct} percent` : ''}${picked ? ', your vote' : ''}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, minHeight: 44 }}>
            <Avatar url={p.players?.photo_url} name={p.players?.full_name} size={36} />
            <View style={{ flex: 1, gap: 4 }}>
              <T style={{ fontWeight: picked ? '800' : '600' }}>{p.players?.shirt_number != null ? `#${p.players.shirt_number} ` : ''}{p.players?.full_name}{picked ? ' ✓' : ''}</T>
              {showTally ? <View style={{ height: 6, borderRadius: 3, backgroundColor: '#E6E8EC', overflow: 'hidden' }}><View style={{ width: `${pct}%`, height: 6, backgroundColor: c }} /></View> : null}
            </View>
            {showTally ? <T muted style={{ width: 44, textAlign: 'right' }}>{pct}%</T> : null}
          </Pressable>
        );
      }) : null}
      <Err msg={err} />
    </Card>
  );
}
