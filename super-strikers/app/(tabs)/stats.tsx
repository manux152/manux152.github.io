import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen, H, T, Card, Loading, Err } from '../../components/ui';
import { useTable } from '../../lib/useQuery';

const BOARDS: { key: string; title: string }[] = [
  { key: 'goals', title: 'Top scorers' }, { key: 'assists', title: 'Top assists' },
  { key: 'appearances', title: 'Appearances' }, { key: 'yellow_cards', title: 'Yellow cards' }, { key: 'red_cards', title: 'Red cards' },
];

export default function Stats() {
  const { data, loading, error } = useTable('player_stats');
  if (loading) return <Loading />;
  const rows = data as any[];
  return (
    <Screen><H>Statistics</H><Err msg={error} />
      {BOARDS.map((b) => {
        const top = [...rows].filter((r) => r[b.key] > 0).sort((a, c) => c[b.key] - a[b.key]).slice(0, 10);
        return (
          <Card key={b.key}>
            <T style={{ fontWeight: '800', fontSize: 17 }}>{b.title}</T>
            {top.length === 0 && <T muted>Nothing recorded yet.</T>}
            {top.map((r, i) => (
              <Link key={r.player_id} href={`/player/${r.player_id}`} asChild><Pressable>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                  <T>{i + 1}. {r.full_name}</T><T style={{ fontWeight: '800' }}>{r[b.key]}</T>
                </View>
              </Pressable></Link>
            ))}
          </Card>
        );
      })}
    </Screen>
  );
}
