import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen, H, T, Card, Loading, Avatar } from '../../../components/ui';
import { useTable } from '../../../lib/useQuery';
import { useApp } from '../../../lib/app-context';
import { avg, statusLabel } from '../../../lib/development';

/** Squad overview: who is injured or on a return-to-play plan, and each player's recent average rating. */
export default function Development() {
  const { can } = useApp();
  const players = useTable('players', (q) => q.eq('is_active', true).order('shirt_number').select('id, full_name, shirt_number, photo_url, positions(name)'));
  const inj = useTable('player_injuries', (q) => q.neq('status', 'cleared').order('started_on', { ascending: false }));
  const rat = useTable('player_ratings', (q) => q.not('rating', 'is', null).order('created_at', { ascending: false }).limit(600).select('player_id, rating'));
  if (!can('development.manage')) return <Screen><T>No permission.</T></Screen>;
  if (players.loading || inj.loading || rat.loading) return <Loading />;
  const open = (pid: string) => (inj.data as any[]).find((i) => i.player_id === pid);
  const recent = (pid: string) => avg((rat.data as any[]).filter((r) => r.player_id === pid).slice(0, 5).map((r) => Number(r.rating)));
  const unavailable = (inj.data as any[]).filter((i) => i.status === 'out').length;
  return (
    <Screen>
      <H>Player development</H>
      <T muted>{unavailable} out · {(inj.data as any[]).length - unavailable} on limited training. Average = last 5 ratings. Everything here is private to staff.</T>
      {(players.data as any[]).map((p) => { const i = open(p.id); const a = recent(p.id); return (
        <Link key={p.id} href={`/admin/development/${p.id}` as any} asChild><Pressable accessibilityRole="button" accessibilityLabel={`Open ${p.full_name}`}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Avatar url={p.photo_url} name={p.full_name} size={40} />
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '700' }}>{p.shirt_number != null ? `#${p.shirt_number} ` : ''}{p.full_name}</T>
              <T muted>{[p.positions?.name, i ? `${statusLabel(i.status)}${i.expected_return ? ` · back ~${i.expected_return}` : ''}` : null].filter(Boolean).join(' · ')}</T>
            </View>
            <T style={{ fontWeight: '800', fontSize: 18 }}>{a ?? '–'}</T>
          </Card></Pressable></Link>); })}
    </Screen>
  );
}
