import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { Screen, H, T, Card, Btn, Loading, Err, fmtDate } from '../../../components/ui';
import { supabase } from '../../../lib/supabase';
import { useTable } from '../../../lib/useQuery';
import { useApp } from '../../../lib/app-context';

export default function NewsAdmin() {
  const { can } = useApp(); const router = useRouter();
  const { data, loading, refresh } = useTable('news_posts', (q) => q.order('created_at', { ascending: false }).limit(100));
  const [err, setErr] = useState<string | null>(null);
  if (!can('news.manage')) return <Screen><T>No permission.</T></Screen>;
  if (loading) return <Loading />;
  const toggle = async (p: any) => {
    const { error } = await supabase.from('news_posts').update({ published_at: p.published_at ? null : new Date().toISOString() }).eq('id', p.id);
    if (error) setErr(error.message); await refresh();
  };
  return (
    <Screen>
      <H>News</H>
      <Btn title="✨ Write with AI (from your club data)" onPress={() => router.push('/admin/news/new?ai=1' as any)} />
      <Btn title="+ Write a story manually" kind="ghost" onPress={() => router.push('/admin/news/new' as any)} />
      <Err msg={err} />
      {(data as any[]).length === 0 && <T muted>No stories yet.</T>}
      {(data as any[]).map((p) => {
        const live = p.published_at && new Date(p.published_at) <= new Date(); const sched = p.published_at && !live;
        return (
          <Card key={p.id}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {p.cover_url ? <Image source={{ uri: p.cover_url }} style={{ width: 72, height: 72, borderRadius: 8 }} contentFit="cover" accessibilityLabel="" /> : null}
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: '700' }}>{p.title}</T>
                <T muted style={{ fontSize: 12 }}>{live ? `Published ${fmtDate(p.published_at)}` : sched ? `Scheduled ${fmtDate(p.published_at)}` : 'Draft'}{p.ai_generated ? ' · AI draft' : ''}{(p.gallery ?? []).length ? ` · ${(p.gallery ?? []).length} pictures` : ''}</T>
              </View>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Btn title="Edit" kind="ghost" onPress={() => router.push(`/admin/news/${p.id}` as any)} />
              <Btn title={p.published_at ? 'Unpublish' : 'Publish now'} kind="ghost" onPress={() => toggle(p)} />
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}
