import { useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Screen, H, T, Card, Btn, Err, Loading } from '../../components/ui';
import { useTable } from '../../lib/useQuery';
import { useApp } from '../../lib/app-context';
import { supabase } from '../../lib/supabase';

const paragraphs = (s: string) => String(s ?? '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

// A leader's own page, opened from the About page. Everything on it is written in Admin → About us.
export default function LeaderPage() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter(); const { session } = useApp(); const { width } = useWindowDimensions();
  const { data, loading, error } = useTable('about_leaders', (q) => q.eq('id', String(id)).eq('is_visible', true), [id]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  if (loading) return <Loading />;
  const p: any = data[0];
  const back = <Btn title="← About us" kind="ghost" onPress={() => router.push('/about' as any)} />;
  if (error || !p) return <Screen><H>Leader</H><T muted>We could not find this profile.</T>{back}</Screen>;

  const size = Math.min(width - 32, 360);
  const message = async () => {
    setErr(null); setBusy(true);
    const { data: room, error: e } = await supabase.rpc('about_message_leader', { p_leader: p.id });
    setBusy(false); if (e) return setErr(e.message);
    router.push(`/chat/${room}` as any);
  };
  return (
    <Screen>
      {back}
      <Card>
        <View style={{ width: size, height: size, borderRadius: 12, overflow: 'hidden', backgroundColor: '#E6E8EC', alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
          {p.photo_url
            ? <Image source={{ uri: p.photo_url }} style={{ width: size, height: size }} contentFit="cover" accessibilityLabel={p.full_name} />
            : <T raw muted style={{ fontSize: 56, fontWeight: '800' }}>{initials(p.full_name)}</T>}
        </View>
        <H style={{ marginTop: 8 }}>{p.full_name}</H>
        {p.role_title ? <T muted style={{ fontWeight: '700', fontSize: 16 }}>{p.role_title}</T> : null}
        {paragraphs(p.bio).map((b, i) => <T key={i} style={{ lineHeight: 23, marginTop: 6 }}>{b}</T>)}
      </Card>
      {p.has_account ? (session
        ? <><Btn title={busy ? 'Opening…' : 'Send a message'} onPress={message} disabled={busy} /><Err msg={err} /></>
        : <Btn title="Sign in to send a message" kind="ghost" onPress={() => router.push('/login' as any)} />) : null}
    </Screen>
  );
}
