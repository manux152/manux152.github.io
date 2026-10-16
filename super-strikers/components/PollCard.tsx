import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { T, Card, Err, useColor } from './ui';
import { useApp } from '../lib/app-context';
import { castPollVote, myPollVote, pollOpen, pollResults, type Poll } from '../lib/fans';

/** A quick fan poll. One vote each (changeable while open); results show as your settings say; nobody sees who voted for what. */
export function PollCard({ poll }: { poll: Poll }) {
  const { session, settings } = useApp(); const c = useColor(); const me = session?.user.id ?? null;
  const [mine, setMine] = useState<string | null>(null); const [res, setRes] = useState<Record<string, number>>({});
  const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  const open = pollOpen(poll);
  const load = useCallback(async () => { setRes(await pollResults(poll.id)); if (me) setMine(await myPollVote(poll.id, me)); }, [poll.id, me]);
  useEffect(() => { load(); }, [load]);
  if (settings.polls_enabled === false) return null;
  const total = Object.values(res).reduce((a, b) => a + b, 0); const show = Object.keys(res).length > 0 && (total > 0 || !open);
  const vote = async (id: string) => { if (!me || busy || !open) return; setBusy(true); setErr(null); try { await castPollVote(poll.id, me, id); setMine(id); await load(); } catch (e: any) { setErr(e.message); } setBusy(false); };
  return (
    <Card>
      <T style={{ fontWeight: '800', fontSize: 17 }}>📊 {poll.question}</T>
      {open && !me ? <T muted>Sign in to vote.</T> : !open ? <T muted>Voting closed.</T> : null}
      {poll.poll_options.map((o) => { const n = res[o.id] ?? 0; const pct = show && total ? Math.round((n / total) * 100) : 0; const picked = mine === o.id; return (
        <Pressable key={o.id} disabled={!open || !me || busy} onPress={() => vote(o.id)} accessibilityRole="button" accessibilityLabel={`${open ? 'Vote ' : ''}${o.label}${show ? `, ${pct} percent` : ''}${picked ? ', your vote' : ''}`} style={{ minHeight: 44, justifyContent: 'center', gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T style={{ fontWeight: picked ? '800' : '600', flex: 1 }}>{o.label}{picked ? ' ✓' : ''}</T>{show ? <T muted>{pct}%</T> : null}</View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: '#E6E8EC', overflow: 'hidden' }}>{show ? <View style={{ width: `${pct}%`, height: 8, backgroundColor: c }} /> : null}</View>
        </Pressable>); })}
      {show ? <T muted style={{ fontSize: 12 }}>{total} vote{total === 1 ? '' : 's'}</T> : mine ? <T muted style={{ fontSize: 12 }}>Thanks for voting. Results appear when the poll closes.</T> : null}
      <Err msg={err} />
    </Card>
  );
}
