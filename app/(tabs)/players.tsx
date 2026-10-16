import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { Screen, H, T, Card, Loading, Err, Input, Chips } from '../../components/ui';
import { useTable } from '../../lib/useQuery';
import { useLayout } from '../../lib/layout';
import { PageHead } from '../../components/PageHead';
import { FullImage } from '../../components/FullImage';
import { Masonry } from '../../components/Masonry';

export default function Players() {
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
      <Masonry items={list} columns={Math.max(1, Math.min(4, cols))} keyOf={(p) => p.id} render={(p) => (
        <Link href={`/player/${p.id}`} asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={p.full_name}>
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              {p.photo_url ? (
                <FullImage uri={p.photo_url} alt={p.full_name} radius={0} fallbackRatio={3 / 4}>
                  {p.shirt_number != null && <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: '#000A', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}><T style={{ color: '#fff', fontWeight: '800' }}>#{p.shirt_number}</T></View>}
                </FullImage>
              ) : <View style={{ aspectRatio: 1, backgroundColor: '#E6E8EC', alignItems: 'center', justifyContent: 'center' }}><T muted style={{ fontSize: 40 }}>👤</T>{p.shirt_number != null && <View style={{ position: 'absolute', top: 8, left: 8, backgroundColor: '#000A', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}><T style={{ color: '#fff', fontWeight: '800' }}>#{p.shirt_number}</T></View>}</View>}
              <View style={{ padding: 10, gap: 2 }}>
                <T style={{ fontWeight: '800' }}>{p.full_name}</T>
                <T muted style={{ fontSize: 13 }}>{posName(p.position_id)}{p.height_cm ? ` · ${p.height_cm} cm` : ''}{p.preferred_foot ? ` · ${p.preferred_foot} foot` : ''}</T>
              </View>
            </Card>
          </Pressable>
        </Link>
      )} />
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
