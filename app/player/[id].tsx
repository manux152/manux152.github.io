import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Image } from 'expo-image';
import { Screen, H, T, Card, Loading } from '../../components/ui';
import { useTable } from '../../lib/useQuery';
import { PageHead } from '../../components/PageHead';
import { FullImage } from '../../components/FullImage';
import { Appearances } from '../../components/Appearances';
import { Lightbox } from '../../components/Lightbox';
import { BadgeRow } from '../../components/BadgeRow';
import { FormGuide } from '../../components/FormGuide';
import { HighlightsCard } from '../../components/HighlightsCard';
import { useBadges, useForm } from '../../lib/development';

export default function PlayerDetail() {
  const { id } = useLocalSearchParams<{ id: string }>(); const [zoom, setZoom] = useState<number | null>(null);
  const p = useTable('players', (q) => q.eq('id', id).select('*, positions(name)'), [id]);
  const st = useTable('player_stats', (q) => q.eq('player_id', id), [id]);
  const aw = useTable('awards', (q) => q.eq('player_id', id).eq('is_published', true).order('awarded_on', { ascending: false }).select('*, award_types(label)'), [id]);
  const badges = useBadges(id); const { form } = useForm(id, 10);
  if (p.loading) return <Loading />;
  const x: any = p.data[0], s: any = st.data[0] ?? {};
  if (!x) return <Screen><T muted>Player not found.</T></Screen>;
  const cols: [string, any][] = [['Apps', s.appearances ?? 0], ['Goals', s.goals ?? 0], ['Assists', s.assists ?? 0], ['Yellow', s.yellow_cards ?? 0], ['Red', s.red_cards ?? 0]];
  const facts: [string, string | null][] = [['Position', x.positions?.name ?? null], ['Jersey', x.shirt_number != null ? `#${x.shirt_number}` : null],
    ['Height', x.height_cm ? `${x.height_cm} cm` : null], ['Preferred foot', x.preferred_foot ? x.preferred_foot[0].toUpperCase() + x.preferred_foot.slice(1) : null]];
  return (
    <Screen><PageHead title={x.full_name} description={x.bio || `${x.full_name} — ${x.positions?.name ?? 'player'}`} image={x.photo_url} />
      {x.photo_url ? <View style={{ maxWidth: 560, width: '100%', alignSelf: 'center' }}><FullImage uri={x.photo_url} alt={x.full_name} radius={14} fallbackRatio={3 / 4} onPress={() => setZoom(0)} /></View> : <View style={{ aspectRatio: 1, borderRadius: 14, backgroundColor: '#E6E8EC', maxWidth: 420, width: '100%', alignSelf: 'center', alignItems: 'center', justifyContent: 'center' }}><T muted style={{ fontSize: 64 }}>👤</T></View>}
      {x.photo_url ? <Lightbox items={[{ id: x.id, kind: 'image', url: x.photo_url, title: x.full_name, caption: x.bio || null, meta: [[x.positions?.name, x.shirt_number != null ? `#${x.shirt_number}` : null].filter(Boolean).join(' · ')] }]} index={zoom} onIndex={setZoom} onClose={() => setZoom(null)} /> : null}
      <H>{x.shirt_number != null ? `#${x.shirt_number} ` : ''}{x.full_name}</H>
      <Card>{facts.filter(([, v]) => v).map(([k, v]) => (
        <View key={k} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T muted>{k}</T><T style={{ fontWeight: '700' }}>{v}</T></View>))}</Card>
      <Card><View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {cols.map(([k, v]) => <View key={k} style={{ alignItems: 'center' }}><T muted>{k}</T><T style={{ fontWeight: '800', fontSize: 20 }}>{v}</T></View>)}
      </View></Card>
      {badges.length ? <BadgeRow badges={badges} /> : null}
      <FormGuide rows={form} />
      <HighlightsCard playerId={id} title="Clips" />
      {x.bio ? <Card><T>{x.bio}</T></Card> : null}
      <Card><Appearances playerId={x.id} name={x.full_name} title={`Tagged appearances of ${x.full_name}`} /></Card>
      {(aw.data as any[]).length > 0 && <Card><T style={{ fontWeight: '800' }}>Awards</T>{(aw.data as any[]).map((a) => <T key={a.id}>🏆 {a.award_types?.label} · {a.period_label}</T>)}</Card>}
    </Screen>
  );
}
