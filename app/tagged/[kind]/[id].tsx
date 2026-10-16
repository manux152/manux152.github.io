import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { Screen, H, T, Avatar } from '../../../components/ui';
import { Appearances } from '../../../components/Appearances';
import { useTable } from '../../../lib/useQuery';

// Everywhere one person (a member, or a player) is tagged: news articles and photos / videos.
export default function Tagged() {
  const { kind, id, name, photo } = useLocalSearchParams<{ kind: string; id: string; name?: string; photo?: string }>();
  const isPlayer = kind === 'player';
  const pl = useTable('players', (q) => (isPlayer ? q.eq('id', id) : q.limit(0)), [id, kind]);
  const p: any = (pl.data as any[])[0]; const label = p?.full_name ?? name ?? 'Member'; const pic = p?.photo_url ?? photo ?? null;
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Avatar url={pic} name={label} size={72} />
        <View style={{ flex: 1 }}><H>{label}</H><T muted>{isPlayer ? 'Player' : 'Member'} · tagged appearances</T></View>
      </View>
      <Appearances playerId={isPlayer ? id : null} profileId={isPlayer ? null : id} name={label} />
    </Screen>
  );
}
