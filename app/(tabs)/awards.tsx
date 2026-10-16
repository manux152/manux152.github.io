import { Link } from 'expo-router';
import { Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Screen, H, T, Card, Loading, Err } from '../../components/ui';
import { useTable } from '../../lib/useQuery';

export default function Awards() {
  const { data, loading, error } = useTable('awards', (q) => q.eq('is_published', true).order('awarded_on', { ascending: false }).limit(60).select('*, players(id,full_name,photo_url), award_types(label,sort_order)'));
  if (loading) return <Loading />;
  return (
    <Screen><H>Awards</H><Err msg={error} />
      {data.length === 0 && <T muted>No awards yet.</T>}
      {(data as any[]).map((a) => {
        const card = (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {a.players?.photo_url ? <Image source={{ uri: a.players.photo_url }} style={{ width: 56, height: 56, borderRadius: 28 }} /> : <T style={{ fontSize: 34 }}>🏆</T>}
            <Card style={{ flex: 1, borderWidth: 0, padding: 0 }}>
              <T muted>{a.award_types?.label} · {a.period_label}</T>
              <T style={{ fontWeight: '800', fontSize: 17 }}>{a.players?.full_name ?? '—'}</T>
              {a.note ? <T muted>{a.note}</T> : null}
            </Card>
          </Card>
        );
        return a.players ? <Link key={a.id} href={`/player/${a.players.id}`} asChild><Pressable>{card}</Pressable></Link> : card;
      })}
    </Screen>
  );
}
