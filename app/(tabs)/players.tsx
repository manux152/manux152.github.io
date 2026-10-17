import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Screen, H, T, Card, Loading, Err, Input, Chips } from '../../components/ui';
import { useTable } from '../../lib/useQuery';
import { useLayout } from '../../lib/layout';
import { PageHead } from '../../components/PageHead';

const GAP = 12;
export default function Players() {
  const [w, setW] = useState(0);
  const { cols } = useLayout();
  const [q, setQ] = useState(''); const [pos, setPos] = useState<string | null>(null); const [sort, setSort] = useState<string>('number');
  const positions = useTable('positions', (x) => x.order('sort_order'));
  const { data, loading, error } = useTable('players', (x) => x.eq('is_active', true).order('shirt_number'));
  const staff = useTable('staff', (x) => x.order('sort_order'));
  if (loading) return <Loading />;
  const posName = (id: string) => (positions.data as any[]).find((x) => x.id === id)?.name ?? '';
  const list = (data as any[]).filter((p) => p.full_name.toLowerCase().includes(q.toLowerCase()) && (!pos || p.position_id === pos))
    .sort((a, b) => sort === 'name' ? a.full_name.localeCompare(b.full_name) : sort === 'height' ? (b.height_cm ?? 0) - (a.height_cm ?? 0) : (a.shirt_number ?? 999) - (b.shirt_number ?? 999));
  return (
    <Screen><PageHead title="Squad" description="Meet the players: photos, positions, heights and jersey numbers." /><H>Squad</H><Err msg={error} />
      <Input placeholder="Search players" value={q} onChangeText={setQ} />
      <Chips options={(positions.data as any[]).map((p) => ({ value: p.id, label: p.name }))} value={pos} onChange={setPos} />
      <Chips options={[{ value: 'number', label: 'By number' }, { value: 'name', label: 'A–Z' }, { value: 'height', label: 'Tallest' }]} value={sort} onChange={(v) => v && setSort(v)} />
      {/* Every tile is exactly the same size: same photo box (3:4, centred on the top so faces stay in view), same text area. The full picture is on the player page. */}
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, width: '100%' }}>
        {w > 0 && list.map((p) => {
          const n = Math.max(1, Math.min(4, cols)); const tile = Math.floor((w - GAP * (n - 1)) / n);
          const badge = p.shirt_number != null ? <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: '#000A', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}><T style={{ color: '#fff', fontWeight: '800' }}>#{p.shirt_number}</T></View> : null;
          return (
            <Link key={p.id} href={`/player/${p.id}`} asChild>
              <Pressable accessibilityRole="link" accessibilityLabel={p.full_name} style={{ width: tile }}>
                <Card style={{ padding: 0, overflow: 'hidden', width: tile, height: Math.round(tile * 4 / 3) + 66 }}>
                  <View style={{ width: tile, height: Math.round(tile * 4 / 3), backgroundColor: '#E6E8EC', alignItems: 'center', justifyContent: 'center' }}>
                    {p.photo_url ? <Image source={{ uri: p.photo_url }} accessibilityLabel={p.full_name} contentFit="cover" contentPosition="top" transition={120} style={{ width: tile, height: Math.round(tile * 4 / 3) }} /> : <T muted style={{ fontSize: 40 }}>👤</T>}
                    {badge}
                  </View>
                  <View style={{ height: 66, padding: 10, gap: 2, justifyContent: 'center' }}>
                    <T numberOfLines={1} style={{ fontWeight: '800' }}>{p.full_name}</T>
                    <T muted numberOfLines={2} style={{ fontSize: 13 }}>{posName(p.position_id)}{p.height_cm ? ` · ${p.height_cm} cm` : ''}{p.preferred_foot ? ` · ${p.preferred_foot} foot` : ''}</T>
                  </View>
                </Card>
              </Pressable>
            </Link>
          );
        })}
      </View>
      {list.length === 0 && <T muted>No players found.</T>}
      {(staff.data as any[]).length > 0 && <><H>Coaching & management</H>
        {(staff.data as any[]).map((s) => (
          <Card key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {s.photo_url ? <Image source={{ uri: s.photo_url }} style={{ width: 52, height: 52, borderRadius: 26 }} contentFit="cover" /> : <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#E6E8EC' }} />}
            <View><T style={{ fontWeight: '700' }}>{s.full_name}</T><T muted>{s.title}</T></View>
          </Card>
        ))}</>}
    </Screen>
  );
}
