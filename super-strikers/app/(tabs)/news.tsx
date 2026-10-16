import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Screen, H, T, Card, Loading, Err, fmtDate } from '../../components/ui';
import { FullImage } from '../../components/FullImage';
import { Masonry } from '../../components/Masonry';
import { useTable } from '../../lib/useQuery';
import { useLayout } from '../../lib/layout';
import { PageHead } from '../../components/PageHead';

// Headlines and pictures only: each picture is shown whole at full width; tap a story to read it.
export default function News() {
  const { cols } = useLayout();
  const { data, loading, error } = useTable('news_posts', (q) => q.not('published_at', 'is', null).lte('published_at', new Date().toISOString()).order('published_at', { ascending: false }).limit(40));
  if (loading) return <Loading />;
  const columns = Math.min(3, Math.max(1, cols));
  return (
    <Screen><PageHead title="News" description="Latest club news and features." /><H>News</H><Err msg={error} />
      {data.length === 0 && <T muted>No news yet.</T>}
      <Masonry items={data as any[]} columns={columns} keyOf={(p) => p.id} render={(p) => (
        <Link href={`/news/${p.slug}`} asChild><Pressable accessibilityRole="link" accessibilityLabel={p.title}><Card style={{ padding: 0, overflow: 'hidden' }}>
          {p.cover_url ? <FullImage uri={p.cover_url} alt="" radius={0} /> : null}
          <View style={{ padding: 12, gap: 4 }}>
            <T muted style={{ fontSize: 12 }}>{p.category ? `${p.category} · ` : ''}{fmtDate(p.published_at)}</T>
            <T style={{ fontWeight: '800', fontSize: 18, lineHeight: 24 }}>{p.title}</T>
          </View>
        </Card></Pressable></Link>
      )} />
    </Screen>
  );
}
