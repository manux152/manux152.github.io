import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen, H, T, Card, Loading, Err, Chips } from '../components/ui';
import { PageHead } from '../components/PageHead';
import { OpponentHeader, RecordSummary, Meetings } from '../components/HeadToHead';
import { useHeadToHead, ppg } from '../lib/headToHead';

const SORTS = [{ value: 'played', label: 'Most played' }, { value: 'best', label: 'Best record' }, { value: 'toughest', label: 'Toughest' }];

export default function HeadToHeadScreen() {
  const { opponent } = useLocalSearchParams<{ opponent?: string }>();
  const { rows, loading, error } = useHeadToHead();
  const [sort, setSort] = useState<string>('played');
  const [open, setOpen] = useState<string | null>(typeof opponent === 'string' ? opponent : null);
  const list = useMemo(() => {
    const r = [...rows];
    if (sort === 'best') r.sort((a, b) => ppg(b) - ppg(a) || (b.gf - b.ga) - (a.gf - a.ga) || b.played - a.played);
    if (sort === 'toughest') r.sort((a, b) => ppg(a) - ppg(b) || (a.gf - a.ga) - (b.gf - b.ga) || b.played - a.played);
    return r;
  }, [rows, sort]);
  if (loading) return <Loading />;
  const total = rows.reduce((a, h) => a + h.played, 0);

  return (
    <Screen>
      <PageHead title="Head-to-head record" description="Our record against every team we have played: wins, draws, losses, goals and every meeting." />
      <H>Head-to-head record</H>
      <Err msg={error} />
      {!rows.length ? <T muted>No finished matches yet. Records appear here as results are added.</T> : (<>
        <T muted>{total} finished {total === 1 ? 'match' : 'matches'} against {rows.length} {rows.length === 1 ? 'team' : 'teams'}. Tap a team for every meeting.</T>
        <Chips options={SORTS} value={sort} onChange={(v) => v && setSort(v)} />
        {list.map((h) => {
          const on = open === h.opponent_id;
          return (
            <Card key={h.opponent_id}>
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: on }} onPress={() => setOpen(on ? null : h.opponent_id)} style={{ gap: 10 }}>
                <OpponentHeader h={h} />
                <RecordSummary h={h} />
                <T muted style={{ fontSize: 13 }}>{on ? 'Hide meetings ▲' : `Show ${h.played} ${h.played === 1 ? 'meeting' : 'meetings'} ▼`}</T>
              </Pressable>
              {on ? <View style={{ marginTop: 4 }}><Meetings h={h} /></View> : null}
            </Card>);
        })}
      </>)}
    </Screen>
  );
}
